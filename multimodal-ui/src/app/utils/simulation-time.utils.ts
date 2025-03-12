/**
 * Return a string corresponding to a time in seconds considering that
 * the input time represents the number of seconds since the beginning of a day.
 *
 * The output string is formatted as "HH:MM:SS".
 */
export function simulationTimeDisplay(time: number): string {
  return new Date(time * 1000).toISOString().slice(11, 19);
}
