// Bereket — Hesap silme Edge Function (bereket-delete-account) — İZOLE MOD
// beebook projesi tek paylaşılan auth hesabını 6 uygulamayla kullanır.
// Bu fonksiyon SADECE Bereket verisini (brkt_data + brkt_vaults/brkt_members,
// sahiplik devriyle) siler. Auth hesabını yalnızca
// kullanıcının DİĞER uygulamalarda da hiçbir verisi kalmamışsa siler; aksi halde
// hesap ve diğer uygulamaların verisi korunur. verify_jwt=true -> yalnızca kendi hesabı.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Diğer uygulamaların, kullanıcıya ait veri barındırabilecek tabloları
const OTHER_TABLES = [
  "borc_people", "borc_debts", "borc_payments", "borc_ayarlar",
  "hediye_persons", "hediye_records",
  "bd_sezonlar", "bd_hasatlar", "bd_siparisler", "bd_zekatlar", "bd_ayarlar",
  "user_data",
];

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

    // JWT sahibini doğrula
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user)
      return new Response(JSON.stringify({ error: "Geçersiz oturum" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const uid = user.id;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1) Bereket verisini sil
    const { error: brktErr } = await admin.from("brkt_data").delete().eq("user_id", uid);
    if (brktErr) throw brktErr;

    // 1.b) Paylaşılan kasalar (v1.19.0)
    // Silme ASLA engellenmez (Play şartı), ama başkasının verisi yok edilmez:
    // sahibi olduğum kasada başka aktif üye varsa sahiplik EN ESKİ üyeye devrolur,
    // yoksa kasa verisiyle birlikte silinir. Sadece üye olduğum kasalar aynen kalır.
    let vaultsTransferred = 0;
    let vaultsDeleted = 0;
    const { data: myVaults } = await admin
      .from("brkt_vaults").select("id").eq("owner_id", uid);

    for (const v of myVaults ?? []) {
      const { data: others } = await admin
        .from("brkt_members")
        .select("id,user_id,email,joined_at")
        .eq("vault_id", v.id)
        .eq("status", "active")
        .neq("user_id", uid)
        .order("joined_at", { ascending: true });

      if (others && others.length > 0) {
        const heir = others[0];
        await admin.from("brkt_vaults").update({ owner_id: heir.user_id }).eq("id", v.id);
        await admin.from("brkt_members").update({ role: "owner" }).eq("id", heir.id);
        await admin.from("brkt_members").delete().eq("vault_id", v.id).eq("user_id", uid);
        vaultsTransferred++;
      } else {
        // brkt_members satırları ON DELETE CASCADE ile gider
        await admin.from("brkt_vaults").delete().eq("id", v.id);
        vaultsDeleted++;
      }
    }
    // Sadece üye olduğum kasalardan üyeliğimi kaldır (kasalar ve verileri kalır)
    await admin.from("brkt_members").delete().eq("user_id", uid);

    // 2) Diğer uygulamalarda kullanıcıya ait veri var mı kontrol et
    let hasOther = false;
    for (const t of OTHER_TABLES) {
      const { count, error } = await admin.from(t).select("user_id", { count: "exact", head: true }).eq("user_id", uid);
      if (error) continue; // tablo yoksa/erişilemezse atla
      if ((count ?? 0) > 0) { hasOther = true; break; }
    }

    // 3) Başka veri yoksa auth hesabını da sil
    let accountDeleted = false;
    if (!hasOther) {
      const { error: delErr } = await admin.auth.admin.deleteUser(uid);
      if (delErr) throw delErr;
      accountDeleted = true;
    }

    return new Response(JSON.stringify({ success: true, accountDeleted, vaultsTransferred, vaultsDeleted }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
