import {checkGitHubReleaseStatus} from '../github';
import {createRepository} from '../../services/__mock_services__';

test('checkGitHubReleaseStatus', async () => {
  const {repo, dirname, newCommit} = createRepository();
  newCommit({tags: ['single-package@1.0.0']});
  newCommit({tags: ['single-package@2.0.0']});
  newCommit({tags: ['single-package@3.0.0']});
  const status = await checkGitHubReleaseStatus(
    {
      ...repo,
      dirname,
      deployBranch: null,
    },
    null as any,
  );
  expect(status).toMatchInlineSnapshot(`
    Object {
      "ok": true,
      "tags": Array [
        "single-package@1.0.0",
        "single-package@2.0.0",
        "single-package@3.0.0",
      ],
    }
  `);
});
