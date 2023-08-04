import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log(876789876);
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  let jsonBody = {};
  const clonedBody = await req.text();
  try {
    jsonBody = JSON.parse(clonedBody);
  } catch (e) {}
  console.log({ jsonBody });

  try {
    const res = await fetch("http://43.153.8.12:53022/interactions/variation", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "coln",
      },
      cache: "no-store",
      method: "POST",
      body: JSON.stringify(jsonBody),
    });

    const resJson = await res.text();
    console.log({ resJson });
    return new Response(resJson, {
      status: res.status,
      statusText: res.statusText,
    });
  } catch (e) {
    return NextResponse.json(prettyObject(e));
  }
}

export const POST = handle;

export const runtime = "edge";
