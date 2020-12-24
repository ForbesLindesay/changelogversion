export default function isTruthy<T>(
  value: T,
): value is Exclude<T, null | undefined | false | 0 | ''> {
  return !!value;
}
