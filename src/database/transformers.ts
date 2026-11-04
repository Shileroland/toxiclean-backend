/** Money columns are bigint (whole naira / francs); Postgres returns them as strings. */
export const bigintNumber = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/** numeric columns (e.g. percentages like 7.5) also come back as strings. */
export const decimalNumber = bigintNumber;
