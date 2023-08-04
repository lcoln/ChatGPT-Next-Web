import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUUID } from "@/app/utils/uuid";
import { DEFAULT_API_HOST, StoreKey } from "../constant";
import { getHeaders } from "../client/api";
import { BOT_HELLO } from "./chat";
import { getClientConfig } from "../config/client";

export interface AccessControlStore {
  accessCode: string;
  token: string;
  uuid: string;
  sessionId: string;

  needCode: boolean;
  hideUserApiKey: boolean;
  openaiUrl: string;
  mjUrl: string;
  hideBalanceQuery: boolean;

  updateToken: (_: string) => void;
  updateCode: (_: string) => void;
  updateOpenAiUrl: (_: string) => void;
  updateUUID: (_?: string) => void;
  updateSessionId: (_: string) => void;
  enabledAccessControl: () => boolean;
  isAuthorized: () => boolean;
  fetch: () => void;
}

let fetchState = 0; // 0 not fetch, 1 fetching, 2 done

const DEFAULT_OPENAI_URL =
  getClientConfig()?.buildMode === "export" ? DEFAULT_API_HOST : "/api/openai/";
console.log("[API] default openai url", DEFAULT_OPENAI_URL);

export const useAccessStore = create<AccessControlStore>()(
  persist(
    (set, get) => ({
      uuid: "",
      token: "",
      accessCode: "",
      sessionId: "",
      needCode: true,
      hideUserApiKey: false,
      openaiUrl: DEFAULT_OPENAI_URL,
      mjUrl: "/api/mj/",
      hideBalanceQuery: false,

      enabledAccessControl() {
        get().fetch();

        return get().needCode;
      },
      updateCode(code: string) {
        set(() => ({ accessCode: code }));
      },
      updateToken(token: string) {
        set(() => ({ token }));
      },
      updateUUID(uuid?: string) {
        if (!get().uuid) {
          createUUID().then((id) => {
            set(() => ({ uuid: uuid || id }));
          });
        }
      },
      updateSessionId(ssid: string) {
        if (ssid) {
          set(() => ({ sessionId: ssid }));
        }
      },
      updateOpenAiUrl(url: string) {
        set(() => ({ openaiUrl: url }));
      },
      isAuthorized() {
        get().fetch();

        // has token or has code or disabled access control
        return (
          !!get().token || !!get().accessCode || !get().enabledAccessControl()
        );
      },
      fetch() {
        if (fetchState > 0 || getClientConfig()?.buildMode === "export") return;
        fetchState = 1;
        fetch("/api/config", {
          method: "post",
          body: null,
          headers: {
            ...getHeaders(),
          },
        })
          .then((res) => res.json())
          .then((res: DangerConfig) => {
            console.log("[Config] got config from server", res);
            set(() => ({ ...res }));

            if ((res as any).botHello) {
              BOT_HELLO.content = (res as any).botHello;
            }
          })
          .catch(() => {
            console.error("[Config] failed to fetch config");
          })
          .finally(() => {
            fetchState = 2;
          });
      },
    }),
    {
      name: StoreKey.Access,
      version: 1,
    },
  ),
);
