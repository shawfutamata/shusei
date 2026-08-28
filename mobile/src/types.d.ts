declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.webp' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}
