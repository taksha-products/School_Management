import type { HTMLAttributes, JSX } from "react";

type SpinnerProps = HTMLAttributes<HTMLDivElement>;

export const Spinner = (props: SpinnerProps): JSX.Element => {
  // TODO: Add animated spinner styles.
  return <div {...props}>Loading...</div>;
};
