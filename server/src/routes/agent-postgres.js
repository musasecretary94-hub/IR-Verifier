const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth-postgres');
const submissions = require('../services/submissions-postgres');
const { extractForForm } = require('../services/extraction');

const toId = (v) => {
  const n = Number(v);

  if (!Number.isSafeInteger(n) || n < 1) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return n;
};

module.exports = function agentRoutes(ctx) {
  const router = express.Router();

  const bigLimit =
    Math.ceil(ctx.config.maxImageMb * 1.4 + 1) + 'mb';

  router.use(requireAuth(ctx, 'agent'));

  router.get('/unit', wrap(async (req, res) => {
    res.json(await submissions.agentOverview(ctx, req.user));
  }));

  router.post('/check', express.json({ limit: '64kb' }), wrap(async (req, res) => {
    res.json(
      await submissions.checkForAgent(
        ctx,
        req.user,
        (req.body || {}).values
      )
    );
  }));

  router.post('/extract', express.json({ limit: bigLimit }), wrap(async (req, res) => {
    const gate = ctx.limiters.extract.check('u' + req.user.id);

    if (!gate.allowed) {
      throw new HttpError(
        429,
        'too_many_attempts',
        'Too many AI readings. Please type the numbers or try later.'
      );
    }

    res.json(
      await extractForForm(
        ctx,
        (req.body || {}).image,
        { fetchImpl: ctx.fetchImpl }
      )
    );
  }));

  router.post('/submissions', express.json({ limit: bigLimit }), wrap(async (req, res) => {
    const body = req.body || {};

    const result = await submissions.createSubmission(
      ctx,
      req.user,
      {
        values: body.values,
        image: body.image,
        note: body.note,
        attested: body.attested,
        ip: req.ip
      }
    );

    res.status(201).json(result);
  }));

  router.get('/submissions/:id', wrap(async (req, res) => {
    res.json(
      await submissions.getForAgent(
        ctx,
        req.user,
        toId(req.params.id)
      )
    );
  }));

  router.get('/submissions/:id/image', wrap(async (req, res) => {
    const img = await submissions.imageFor(
      ctx,
      toId(req.params.id),
      { agentPuId: req.user.pollingUnitId }
    );

    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'private, max-age=60');
    res.send(img.buffer);
  }));

  return router;
};
