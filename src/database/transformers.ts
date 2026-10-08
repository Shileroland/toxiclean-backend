/** Money columns are bigint (whole naira / francs); Postgres returns them as strings. */
export const bigintNumber = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
