import PullChangeLog from './PullChangeLog';

const stateRegex = /<!-- """[a-zA-Z ]+ State Start""" (.*) """[a-zA-Z ]+ State End""" -->/;
export function readState(body?: string): PullChangeLog | undefined {
  if (!body) return undefined;

  const match = stateRegex.exec(body);

  if (match) {
    const data = JSON.parse(match[1]);
    return data;
  }
  return undefined;
}

export function writeState(body: string, state: PullChangeLog | undefined) {
  const src = body.replace(stateRegex, '');
  if (!state) return src;
  return (
    src +
    `\n\n<!-- """RollingVersions State Start""" ${JSON.stringify(state)
      .replace(/\-/g, '\\u002d')
      .replace(/\>/g, '\\u003e')
      .replace(/\</g, '\\u0060')} """RollingVersions State End""" -->`
  );
}
