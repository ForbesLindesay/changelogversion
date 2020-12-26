import {parseTag, ParseTagContext} from '../';

const baseContext: ParseTagContext = {
  allowTagsWithoutPackageName: false,
  packageName: 'my-package',
  tagFormat: undefined,
  versionSchema: ['MAJOR', 'MINOR', 'PATCH'],
};
test('parseTag', () => {
  expect(
    parseTag('foo-bar', {
      ...baseContext,
      allowTagsWithoutPackageName: false,
    }),
  ).toBe(null);
  expect(
    parseTag('foo-bar', {
      ...baseContext,
      allowTagsWithoutPackageName: true,
    }),
  ).toBe(null);

  expect(
    parseTag('1.0.0', {
      ...baseContext,
      allowTagsWithoutPackageName: false,
    }),
  ).toBe(null);
  expect(
    parseTag('1.0.0', {
      ...baseContext,
      allowTagsWithoutPackageName: true,
    }),
  ).toEqual({
    numerical: [1, 0, 0],
    prerelease: [],
    build: [],
  });

  expect(
    parseTag('my-package@1.0.0', {
      ...baseContext,
      allowTagsWithoutPackageName: false,
    }),
  ).toEqual({
    numerical: [1, 0, 0],
    prerelease: [],
    build: [],
  });
  expect(
    parseTag('my-package@1.0.0', {
      ...baseContext,
      allowTagsWithoutPackageName: true,
    }),
  ).toEqual({
    numerical: [1, 0, 0],
    prerelease: [],
    build: [],
  });
});

test('Custom tag format', () => {
  expect(
    parseTag('0-4-5', {
      ...baseContext,
      tagFormat: '{{PATCH}}-{{MINOR}}-{{MAJOR}}',
    }),
  ).toEqual({
    numerical: [5, 4, 0],
    prerelease: [],
    build: [],
  });
  expect(
    parseTag('before-0-4-5-after', {
      ...baseContext,
      tagFormat: 'before-{{PATCH}}-{{MINOR}}-{{MAJOR}}-after',
    }),
  ).toEqual({
    numerical: [5, 4, 0],
    prerelease: [],
    build: [],
  });
  expect(
    parseTag('before-0-04-006-after', {
      ...baseContext,
      tagFormat:
        'before-{{ PATCH | pad-number 2 }}-{{ MINOR | pad-number 2 }}-{{ MAJOR | pad-number 3 }}-after',
    }),
  ).toEqual({
    numerical: [6, 4, 0],
    prerelease: [],
    build: [],
  });
});