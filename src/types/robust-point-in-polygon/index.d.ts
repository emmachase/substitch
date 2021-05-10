declare module "robust-point-in-polygon" {
  const Func: (poly: [number, number][], pt: [number, number]) => number;
  export default Func;
}
