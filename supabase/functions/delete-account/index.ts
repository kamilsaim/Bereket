// Bereket — Hesap silme Edge Function
// Play Store zorunluluğu: kullanıcı yalnızca KENDİ hesabını uygulama içinden silebilmeli.
// verify_jwt=true ile çağrılır; gelen JWT'den user id çözülür, o kullanıcının
// brkt_data satırı + auth kullanıcısı service role ile silinir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt)
      return new Response(JSON.stringify({ error: "no token" }), { status: 401, headers: cors });

    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) JWT'den kullanıcıyı doğrula
    const admin = createClient(SB_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user)
      return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: cors });

    const userId = userData.user.id;

    // 2) Kullanıcının bulut verisini sil (kişiye özel tek satır)
    await admin.from("brkt_data").delete().eq("user_id", userId);

    // 3) Auth kullanıcısını sil
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr)
      return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: cors });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
