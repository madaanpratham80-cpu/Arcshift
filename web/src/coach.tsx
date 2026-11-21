import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { History, MessageSquare, Plus, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { RunProgress, useRequestKey, useRun } from './actions';
import { ApiError, conversationKey, isPendingRun, request, runQuery, searchPage } from './api';
import type { Envelope } from './api';
import type { Conversation, Message, Run } from './types';
import { EmptyState, ErrorNotice, formatDate, Loading, PageHeading } from './ui';

export function NewConversation({ primary = true }: { primary?: boolean }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async () => (await request<{ conversation: Conversation }>('/conversations', { method: 'POST' })).data.conversation,
    onSuccess: (conversation) => {
      void client.invalidateQueries({ queryKey: conversationKey });
      navigate('/app/coach/' + conversation.id);
    },
  });
  return <>
    <button className={'button ' + (primary ? 'primary' : 'secondary')} type="button" disabled={create.isPending} onClick={() => create.mutate()}>
      <Plus size={18} aria-hidden="true" />{create.isPending ? 'Opening…' : 'New conversation'}
    </button>
    <ErrorNotice error={create.error} />
  </>;
}

export function ConversationsPage() {
  const list = useInfiniteQuery({
    queryKey: conversationKey, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => request<{ conversations: Conversation[] }>('/conversations' + searchPage(pageParam, 20), { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const conversations = list.data?.pages.flatMap((page) => page.data.conversations) ?? [];
  return <>
    <PageHeading title="Conversation history" description="Reopen a session with your coach." actions={<NewConversation />} />
    {list.isPending && <Loading />}
    <ErrorNotice error={list.error} retry={() => void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())} />
    {!conversations.length && list.isSuccess && <EmptyState icon={History} title="No conversations yet"><p>Your conversations will appear here after you start one.</p></EmptyState>}
    {!!conversations.length && <ul className="card record-list">{conversations.map((conversation) => <li key={conversation.id}>
      <Link to={'/app/coach/' + conversation.id}><span><strong>{conversation.title}</strong></span><time dateTime={conversation.updatedAt}>{formatDate(conversation.updatedAt)}</time></Link>
    </li>)}</ul>}
    {list.hasNextPage && <button type="button" className="button secondary more" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load older conversations</button>}
  </>;
}

function TranscriptMessage({ message }: { message: Message }) {
  return <article className={'message ' + message.role}>
    <div className="message-author">{message.role === 'assistant' && <span className="feature-icon"><Sparkles size={15} aria-hidden="true" /></span>}
      <strong>{message.role === 'assistant' ? 'Career Coach' : 'You'}</strong></div>
    <p>{message.text}</p>
    {message.proposalId && <Link className="button secondary" to={'/app/proposals/' + message.proposalId}>Review proposed change</Link>}
    {message.proposalAvailability === 'unavailable' && <div className="muted">A roadmap proposal was unavailable. Ask again with more detail about the change you want.</div>}
  </article>;
}

type TranscriptPage = Envelope<{ conversation: Conversation; messages: Message[] }>;

function ConversationPage({ id }: { id: string }) {
  const client = useQueryClient();
  const key = useRequestKey();
  const [draft, setDraft] = useState('');
  const transcriptKey = ['transcript', id] as const;
  const transcript = useInfiniteQuery({
    queryKey: transcriptKey, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => request<{ conversation: Conversation; messages: Message[] }>('/conversations/' + id + '/messages' + searchPage(pageParam, 30), { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const conversation = transcript.data?.pages[0]?.data.conversation;
  const runId = conversation?.pendingRunId ?? conversation?.lastRunId ?? null;
  const { query, retry } = useRun(runId);
  const status = query.data?.status;
  const waiting = isPendingRun(query.data) || (!!conversation?.pendingRunId && !status);
  const messages = transcript.data?.pages.slice().reverse().flatMap((page) => page.data.messages) ?? [];
  const lastSeq = messages.at(-1)?.seq;
  const tail = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (lastSeq && tail.current) tail.current.scrollIntoView({ block: 'nearest' });
  }, [lastSeq]);

  useEffect(() => {
    if (runId && (status === 'succeeded' || status === 'failed')) {
      void client.invalidateQueries({ queryKey: ['transcript', id] });
      void client.invalidateQueries({ queryKey: conversationKey });
    }
  }, [client, id, runId, status]);

  const send = useMutation({
    mutationFn: async (text: string) => (await request<Run>('/conversations/' + id + '/messages', {
      method: 'POST', body: { text }, key: key.get(text),
    })).data,
    onSuccess: async (run, text) => {
      key.clear();
      setDraft((value) => value === text ? '' : value);
      client.setQueryData(runQuery(run.runId).queryKey, run);
      await client.cancelQueries({ queryKey: transcriptKey });
      client.setQueryData<InfiniteData<TranscriptPage>>(transcriptKey, (cached) => {
        if (!cached?.pages[0]) return cached;
        const [first, ...older] = cached.pages;
        const conversation = { ...first.data.conversation, lastRunId: run.runId, pendingRunId: isPendingRun(run) ? run.runId : null };
        return { ...cached, pages: [{ ...first, data: { ...first.data, conversation } }, ...older] };
      });
      void client.invalidateQueries({ queryKey: transcriptKey });
      void client.invalidateQueries({ queryKey: conversationKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'TURN_IN_PROGRESS') void client.invalidateQueries({ queryKey: transcriptKey });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim() && !waiting && !send.isPending) send.mutate(draft);
  }

  return <>
    <PageHeading title="AI Coach" description={conversation?.title}
      actions={<><Link className="button secondary" to="/app/history"><History size={17} aria-hidden="true" />History</Link><NewConversation primary={false} /></>} />
    <section className="card chat">
      <div className="chat-transcript" aria-label="Conversation messages" tabIndex={0}>
        {transcript.isPending && <Loading>Loading conversation…</Loading>}
        <ErrorNotice error={transcript.error} retry={() => void (transcript.isFetchNextPageError ? transcript.fetchNextPage() : transcript.refetch())} />
        {transcript.hasNextPage && <button className="button secondary more" type="button" disabled={transcript.isFetchingNextPage}
          onClick={() => void transcript.fetchNextPage()}>Load earlier messages</button>}
        {conversation && !messages.length && !waiting && <div className="chat-empty"><span className="feature-icon"><Sparkles size={24} aria-hidden="true" /></span>
          <h2>What would you like to work on?</h2><p>Ask about a milestone, a blocker, or a change to your roadmap.</p>
          <button className="button secondary" type="button" onClick={() => {
            setDraft('Help me choose one milestone to work on this week.');
            composer.current?.focus();
          }}>Choose a milestone for this week</button></div>}
        {messages.map((message) => <TranscriptMessage key={message.id} message={message} />)}
        {query.isPending && waiting && <Loading>Checking for a reply…</Loading>}
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        <RunProgress run={query.isError ? undefined : query.data} retry={retry} label="Your coach is preparing a reply…" />
        <div ref={tail} />
      </div>
      {conversation && <form className="composer" onSubmit={submit}>
        <label htmlFor="coach-message">Message your coach</label>
        <div className="composer-input">
          <textarea ref={composer} id="coach-message" maxLength={4000} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your next step…" />
          <button className="button primary" type="submit" disabled={!draft.trim() || waiting || send.isPending || retry.isPending}>
            <Send size={17} aria-hidden="true" />{send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <ErrorNotice error={send.error} />
      </form>}
    </section>
  </>;
}

export function CoachPage() {
  const { id } = useParams();
  if (id) return <ConversationPage key={id} id={id} />;
  return <>
    <PageHeading title="AI Coach" description="Get help deciding what to do next or adjusting your roadmap."
      actions={<Link className="button secondary" to="/app/history"><History size={17} aria-hidden="true" />History</Link>} />
    <EmptyState icon={MessageSquare} title="Start with a question"><p>Ask for help with a milestone, trade-offs in your plan, or a goal that’s changed.</p><NewConversation /></EmptyState>
  </>;
}
