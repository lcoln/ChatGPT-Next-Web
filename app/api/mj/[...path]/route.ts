import { OpenaiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";

interface IMJParams {
  messages?: { role: string; content: string }[];
  frontMessageId?: number;
  frontSessionId?: number;
}
const ALLOWD_PATH = new Set(Object.values(OpenaiPath));

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[OpenAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWD_PATH.has(subpath)) {
    console.log("[OpenAI Route] forbidden path ", subpath);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + subpath,
      },
      {
        status: 403,
      },
    );
  }

  const authResult = auth(req);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  const uuid = req.headers.get("Uuid") ?? "";
  let jsonBody: IMJParams = {};
  const clonedBody = await req.text();
  try {
    jsonBody = JSON.parse(clonedBody);
  } catch (e) {}
  try {
    const messages = jsonBody?.messages
      ?.slice(-1)[0]
      ?.content?.replace(/[\r\n]/g, " ")
      .trim();
    console.log({ messages });

    const res = await fetch("http://43.153.8.12:53022/mj", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "coln",
      },
      cache: "no-store",
      method: "POST",
      body: JSON.stringify({
        messages: `${messages} --no ${uuid} ${jsonBody.frontMessageId} ${jsonBody.frontSessionId} end`,
      }),
    });

    const resJson = await res.text();
    // console.log({resJson})
    return new Response(resJson, {
      status: res.status,
      statusText: res.statusText,
    });
  } catch (e) {
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
