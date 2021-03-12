import {createRepository} from '../../services/__mock_services__';
import {getAllFiles} from '../../services/git';
import listPackages from '../listPackages';

test('listPackages - single npm package', async () => {
  const {dirname} = createRepository({
    files: [{path: 'package.json', contents: '{"name": "example-package"}'}],
  });
  expect(await listPackages(getAllFiles(dirname))).toMatchInlineSnapshot(`
    Map {
      "example-package" => Object {
        "dependencies": Object {
          "development": Array [],
          "optional": Array [],
          "required": Array [],
        },
        "packageName": "example-package",
        "targetConfigs": Array [
          Object {
            "packageName": "example-package",
            "path": "package.json",
            "private": false,
            "publishConfigAccess": "public",
            "type": "npm",
          },
        ],
      },
    }
  `);
});

test('listPackages - multiple npm packages', async () => {
  const {dirname} = createRepository({
    files: [
      {
        path: 'package.json',
        contents: '{"name": "root-package", "@rollingversions/ignore": true}',
      },
      {
        path: 'package.json',
        contents: '{"name": "@root-package/a"}',
      },
      {
        path: 'package.json',
        contents: '{"name": "@root-package/b"}',
      },
    ],
  });
  expect(await listPackages(getAllFiles(dirname))).toMatchInlineSnapshot(`
    Map {
      "@root-package/a" => Object {
        "dependencies": Object {
          "development": Array [],
          "optional": Array [],
          "required": Array [],
        },
        "packageName": "@root-package/a",
        "targetConfigs": Array [
          Object {
            "packageName": "@root-package/a",
            "path": "package.json",
            "private": false,
            "publishConfigAccess": "restricted",
            "type": "npm",
          },
        ],
      },
      "@root-package/b" => Object {
        "dependencies": Object {
          "development": Array [],
          "optional": Array [],
          "required": Array [],
        },
        "packageName": "@root-package/b",
        "targetConfigs": Array [
          Object {
            "packageName": "@root-package/b",
            "path": "package.json",
            "private": false,
            "publishConfigAccess": "restricted",
            "type": "npm",
          },
        ],
      },
    }
  `);
});
