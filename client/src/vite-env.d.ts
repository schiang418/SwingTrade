/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEMBER_PORTAL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
