import type {Response, Request} from 'express';

import type {PullRequest} from 'rollingversions/lib/types';

const validRequests = new WeakSet<Request>();
export default function validateParams() {
  return (req: Request, res: Response, next: (err?: any) => void) => {
    const {owner, repo, pull_number} = req.params;
    if (!owner) {
      res.status(400).send('Expected a owner parameter');
    } else if (!repo) {
      res.status(400).send('Expected a repo parameter');
    } else if (!pull_number) {
      res.status(400).send('Expected a pull_number parameter');
    } else if (!/^\d+$/.test(pull_number) || pull_number.length > 6) {
      res.status(404).send('This is not a valid pull request number');
    } else {
      validRequests.add(req);
      next();
    }
  };
}
export function parseParams(
  req: Request,
): Pick<PullRequest, 'repo' | 'number'> {
  if (!validRequests.has(req)) {
    throw new Error(
      'This request has not been passed through the validation middleware',
    );
  }
  const {owner, repo, pull_number} = req.params;
  return {repo: {owner, name: repo}, number: parseInt(pull_number, 10)};
}

const validRepoRequests = new WeakSet<Request>();
export function validateRepoParams() {
  return (req: Request, res: Response, next: (err?: any) => void) => {
    const {owner, repo} = req.params;
    if (!owner) {
      res.status(400).send('Expected a owner parameter');
    } else if (!repo) {
      res.status(400).send('Expected a repo parameter');
    } else if (
      req.query.versionByBranch !== undefined &&
      req.query.versionByBranch !== `true` &&
      req.query.versionByBranch !== `false`
    ) {
      res.status(400).send('Expected versionByBranch to be "true" or "false"');
    } else if (
      req.query.branch !== undefined &&
      typeof req.query.branch !== 'string'
    ) {
      res.status(400).send('Expected branch to be a string, if specified.');
    } else {
      validRepoRequests.add(req);
      next();
    }
  };
}
export function parseRepoParams(
  req: Request,
): {owner: string; repo: string; branch?: string; versionByBranch: boolean} {
  if (!validRepoRequests.has(req)) {
    throw new Error(
      'This request has not been passed through the validation middleware',
    );
  }
  const {owner, repo} = req.params;
  return {
    owner,
    repo,
    branch: req.query.branch ?? undefined,
    versionByBranch: req.query.versionByBranch === `true`,
  };
}
