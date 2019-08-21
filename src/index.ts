import { RequestHandler, send } from 'micro';
import { router, get } from 'microrouter';

import { parseFile } from './routes';

const service: RequestHandler = async (req, res) => {
  send(res, 200, 'You are service index, enjoy!');
};

const notFound: RequestHandler = (req, res) =>
  send(res, 404, 'Route not exists');

module.exports = router(
  get('/', service),
  get('/parse/:fileName/:sortBy', parseFile),
  get('/parse/:fileName', parseFile),
  get('/*', notFound),
);
