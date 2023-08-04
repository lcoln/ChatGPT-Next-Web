import {
  DEFAULT_API_HOST,
  OpenaiPath,
  REQUEST_TIMEOUT_MS,
} from "@/app/constant";
import { useAccessStore, useAppConfig, useChatStore } from "@/app/store";

import {
  getHeaders,
  MJOptions,
  CMJApi,
  LLMModel,
  LLMUsage,
  IInteractionsParams,
} from "../api";
import Locale from "../../locales";
import WebSocket from "reconnecting-websocket";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

interface IMJResult {
  url?: string;
  content?: string;
  frontMessageId: number;
  frontSessionId: number;
  index: number;
  type: "upsample" | "variation";
}

let ws: WebSocket | null = null;

function initWs() {
  if (!ws || ws.readyState === 3) {
    const accessStore = useAccessStore.getState();
    ws = new WebSocket(`ws://43.153.8.12:53020`, [accessStore.uuid]);
    console.log(useChatStore.getState(), "useChatStore.getState()");
    ws.onmessage = (ev) => {
      let result: IMJResult;
      try {
        result = JSON.parse(ev.data);
        const { frontSessionId, frontMessageId, url, type, content } = result;
        console.log(`[ws onmessage result] ${JSON.stringify(result)}`);
        if (frontSessionId >= 0 && frontMessageId) {
          if (url && /^((https|http|ftp|rtsp|mms)?:\/\/)[^\s]+/.test(url)) {
            console.log(`[ws onmessage url] ${url}`);
            useChatStore
              .getState()
              .updateMessageById(
                frontSessionId,
                frontMessageId,
                (currentMessage) => {
                  console.log(
                    `[updateMessageById result] ${JSON.stringify(
                      currentMessage,
                    )}`,
                  );
                  if (currentMessage) {
                    currentMessage.content = type
                      ? `![图片结果](${url} "${content}")`
                      : `![图片结果](${url} "${content
                          ?.replace(/\"/g, "")
                          ?.slice(2)}")`;
                    if (type && type !== "upsample") {
                      currentMessage.params = {
                        ...currentMessage.params,
                        ...result,
                        upsample: [1, 2, 3, 4],
                        variation: [1, 2, 3, 4],
                      };
                    }
                  }
                },
              );
          } else if (content) {
            useChatStore
              .getState()
              .updateMessageById(
                frontSessionId,
                frontMessageId,
                (currentMessage) => {
                  if (currentMessage && content) {
                    currentMessage.content = content;
                  }
                },
              );
          }
        }
      } catch (e) {}
    };
    ws.onclose = (ev) => {
      // console.log({ onclose: ev });
    };
  }
}

export class MJApi implements CMJApi {
  public chatOptions: MJOptions | undefined;
  constructor() {
    setTimeout(() => {
      initWs();
    }, 0);
  }
  path(path: string): string {
    let url = useAccessStore.getState().mjUrl;
    if (url.length === 0) {
      url = DEFAULT_API_HOST;
    }
    if (url.endsWith("/")) {
      url = url.slice(0, url.length - 1);
    }
    if (!url.startsWith("http") && !url.startsWith("/api/mj")) {
      url = "https://" + url;
    }
    return [url, path].join("/");
  }

  extractMessage(res: any) {
    return res.choices?.at(0)?.message?.content ?? "";
  }

  async chat(options: MJOptions) {
    const accessStore = useAccessStore.getState();
    initWs();
    this.chatOptions = options;

    const messages = options.messages.map((v) => ({
      role: v.role,
      content: v.content,
    }));

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const requestPayload = {
      messages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
      frontMessageId: 0,
      frontSessionId: 0,
    };

    console.log("[Request] openai payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(OpenaiPath.MJPath);

      const messages = useChatStore.getState().currentSession().messages;

      // console.log({options}, useChatStore.getState().currentSession())
      requestPayload.frontMessageId = messages[messages.length - 1].id || 0;
      requestPayload.frontSessionId = useChatStore
        .getState()
        .currentSession().id;
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(chatPath, chatPayload);

      clearTimeout(requestTimeoutId);

      const resJson = await res.json();
      // console.log({res, resJson})
      options.onFinish(resJson.msg);
      if (resJson.sessionId) {
        accessStore.updateSessionId(resJson.sessionId);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat reqeust", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data.filter((m) => m.id.startsWith("gpt-"));
    console.log("[Models]", chatModels);

    return chatModels.map((m) => ({
      name: m.id,
      available: true,
    }));
  }

  async interactions(requestPayload: IInteractionsParams): Promise<void> {
    const accessStore = useAccessStore.getState();
    initWs();
    const res = await fetch(`/api/interactions/${requestPayload.type}`, {
      method: "POST",
      headers: {
        ...getHeaders(),
      },
      body: JSON.stringify({
        ...requestPayload,
        sessionId: accessStore.sessionId,
      }),
    });
    const { frontSessionId, frontMessageId, index, parentId } = requestPayload;
    console.log(res);
    if (res.ok && parentId) {
      useChatStore
        .getState()
        .updateMessageById(frontSessionId, parentId, (currentMessage) => {
          console.log(
            `[updateMessageById interactions] ${JSON.stringify(
              currentMessage,
            )} ${index}`,
          );
          if (currentMessage?.params?.[requestPayload.type] && index) {
            currentMessage.params[requestPayload.type][index - 1] = null;
          }
        });
    } else {
      useChatStore
        .getState()
        .updateMessageById(frontSessionId, frontMessageId, (currentMessage) => {
          if (currentMessage) {
            currentMessage.content = "请求过于频繁，请重试~";
          }
        });
    }
  }
}
export { OpenaiPath };
