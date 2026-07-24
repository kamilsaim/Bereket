// Bereket — Hesap silme Edge Function (bereket-delete-account)
// Bu proje TEK paylaşılan auth hesabını birden çok uygulamayla kullanır
// (Bereket, Borç Defteri, Hediye, Arıcılık). auth.users'a bağlı tüm user_id
// FK'ları ON DELETE CASCADE olduğu için deleteUser TÜM uygulama verilerini temizler.
// verify_jwt=true -> kullanıcı yalnızca KENDİ hesabını silebilir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Yetkilendirme yok" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Gelen JWT'nin sahibini doğrula
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user)
      return new Response(JSON.stringify({ error: "Geçersiz oturum" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const uid = user.id;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Kullanıcıyı sil -> tüm user_id FK'ları CASCADE olduğu için
    // brkt_data + borc_* + hediye_* + bd_* + user_data hepsi otomatik temizlenir.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
