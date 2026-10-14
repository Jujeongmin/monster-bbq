/// <reference types="vite/client" />

declare module "virtual:art-versions" {
  const versions: Record<string, number>;
  export default versions;
}
