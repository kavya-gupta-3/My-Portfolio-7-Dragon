/// <reference types="vite/client" />

declare module '*.glsl' {
  const source: string;
  export default source;
}

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
}
