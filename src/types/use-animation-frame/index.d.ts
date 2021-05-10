declare module "use-animation-frame" {
  const Func: (cb: (frame: {
    time: number
    delta: number
  }) => void, deps: unknown[]) => void;
  export default Func;
}
