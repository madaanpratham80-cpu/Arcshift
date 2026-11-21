import express from 'express';
import app from '../../.vercel/output/functions/index.func/index.js';

const fixture = express();
fixture.use('/assets', express.static('.vercel/output/static/assets'));
// Mirror the Vercel routing order, with the build's assets ahead of Express.
fixture.use(app);
fixture.listen(Number(process.env.PORT), '127.0.0.1');
