/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEMBER_PORTAL_URL: string;
  readonly VITE_MANUAL_TRIGGER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
