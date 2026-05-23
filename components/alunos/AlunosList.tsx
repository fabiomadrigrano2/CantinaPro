"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addResponsavel, removeResponsavel } from "@/app/alunos/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type AlunoComConta = {
  id: string;
  nome: string;
  ativo: boolean;
  turma: string | null;
  saldo: number;
  tipo_conta: string | null;
  conta_paga?: boolean;
  ciclo_cobranca: string | null;
  dia_cobranca: number | null;
  limite_diario: number | null;
  telefone_responsavel: string | null;
  email_responsavel: string | null;
};

type Responsavel = {
  id: string;
  nome: string;
  email: string | null;
  parentesco: string | null;
};

// ── constantes ────────────────────────────────────────────────────────────────

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "💵 Dinheiro" },
  { value: "pix",      label: "⚡ Pix"      },
  { value: "cartao",   label: "💳 Cartão"   },
] as const;

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function getSaldo(aluno: AlunoComConta) {
  return aluno.saldo ?? 0;
}


function statusBadge(saldo: number) {
  if (saldo > 0)   return { label: "Ativo",     cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" };
  if (saldo === 0) return { label: "Sem saldo", cls: "bg-gray-400/10   text-gray-400   border-gray-400/20"    };
  return                  { label: "Devedor",   cls: "bg-red-400/10    text-red-400    border-red-400/20"     };
}

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

// ── componente ────────────────────────────────────────────────────────────────

export default function AlunosList({ initialAlunos }: { initialAlunos: AlunoComConta[] }) {
  const router = useRouter();
  const [search,       setSearch]       = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);
  const [editingAluno,  setEditingAluno]  = useState<AlunoComConta | null>(null);
  const [deletingAluno, setDeletingAluno] = useState<AlunoComConta | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [togglingPaga,    setTogglingPaga]    = useState<string | null>(null);
  const [creditoAluno,    setCreditoAluno]    = useState<AlunoComConta | null>(null);
  const [fiadoAluno,      setFiadoAluno]      = useState<AlunoComConta | null>(null);
  const [pagamentoSaving, setPagamentoSaving] = useState(false);
  const [pagamentoError,  setPagamentoError]  = useState<string | null>(null);
  const [pagamentoForm,   setPagamentoForm]   = useState({
    valor: "", forma_pagamento: "dinheiro", data: "", observacao: "",
  });
  const [form,          setForm]          = useState({
    nome: "", turma: "", tipo_conta: "credito", saldo_inicial: "0",
    ciclo_cobranca: "mensal", dia_cobranca: "5", limite_diario: "0",
    telefone_responsavel: "", email_responsavel: "",
  });
  const [responsaveis,   setResponsaveis]   = useState<Responsavel[]>([]);
  const [respForm,       setRespForm]       = useState({ nome: "", email: "", parentesco: "responsavel" });
  const [savingResp,     setSavingResp]     = useState(false);
  const [respError,      setRespError]      = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      initialAlunos.filter(
        (a) =>
          a.nome.toLowerCase().includes(search.toLowerCase()) ||
          (a.turma ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [initialAlunos, search]
  );

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  useEffect(() => {
    if (!deletingAluno) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setDeletingAluno(null);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deletingAluno]);

  useEffect(() => {
    if (!creditoAluno) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setCreditoAluno(null);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [creditoAluno]);

  useEffect(() => {
    if (!fiadoAluno) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setFiadoAluno(null);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fiadoAluno]);

  function openModal() {
    setEditingAluno(null);
    setForm({ nome: "", turma: "", tipo_conta: "credito", saldo_inicial: "0", ciclo_cobranca: "mensal", dia_cobranca: "5", limite_diario: "0", telefone_responsavel: "", email_responsavel: "" });
    setResponsaveis([]);
    setRespForm({ nome: "", email: "", parentesco: "responsavel" });
    setRespError(null);
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(aluno: AlunoComConta) {
    setEditingAluno(aluno);
    setForm({
      nome:                 aluno.nome,
      turma:                aluno.turma ?? "",
      tipo_conta:           aluno.tipo_conta ?? "credito",
      saldo_inicial:        String(getSaldo(aluno)),
      ciclo_cobranca:       aluno.ciclo_cobranca ?? "mensal",
      dia_cobranca:         String(aluno.dia_cobranca ?? 5),
      limite_diario:        String(aluno.limite_diario ?? 0),
      telefone_responsavel: aluno.telefone_responsavel ?? "",
      email_responsavel:    aluno.email_responsavel    ?? "",
    });
    setResponsaveis([]);
    setRespForm({ nome: "", email: "", parentesco: "responsavel" });
    setRespError(null);
    setFormError(null);
    setShowModal(true);
    loadResponsaveis(aluno.id);
  }

  async function loadResponsaveis(alunoId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("aluno_responsavel")
      .select("parentesco, responsaveis(id, nome, email)")
      .eq("aluno_id", alunoId);
    if (data) {
      setResponsaveis(
        data
          .map((d: any) => ({
            id:         d.responsaveis?.id   ?? "",
            nome:       d.responsaveis?.nome ?? "",
            email:      d.responsaveis?.email ?? null,
            parentesco: d.parentesco ?? null,
          }))
          .filter((r) => r.id) as Responsavel[]
      );
    }
  }

  function closeModal() { setShowModal(false); }

  function openCreditoModal(aluno: AlunoComConta) {
    setPagamentoForm({ valor: "", forma_pagamento: "dinheiro", data: new Date().toISOString().split("T")[0], observacao: "" });
    setPagamentoError(null);
    setCreditoAluno(aluno);
  }

  function openFiadoModal(aluno: AlunoComConta) {
    const divida = aluno.saldo < 0 ? Math.abs(aluno.saldo).toFixed(2) : "";
    setPagamentoForm({ valor: divida, forma_pagamento: "dinheiro", data: new Date().toISOString().split("T")[0], observacao: "" });
    setPagamentoError(null);
    setFiadoAluno(aluno);
  }

  function setPag(field: string, value: string) {
    setPagamentoForm((f) => ({ ...f, [field]: value }));
  }

  async function handleDelete() {
    if (!deletingAluno) return;
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("alunos")
      .delete()
      .eq("id", deletingAluno.id);

    setDeleting(false);
    if (error) { setDeleteError(error.message); return; }

    setDeletingAluno(null);
    router.refresh();
  }

  async function handleAdicionarCredito(e: React.FormEvent) {
    e.preventDefault();
    if (!creditoAluno) return;
    const valor = parseFloat(pagamentoForm.valor);
    if (isNaN(valor) || valor <= 0) { setPagamentoError("Informe um valor válido."); return; }
    setPagamentoSaving(true);
    setPagamentoError(null);
    const supabase = createClient();
    const novoSaldo = creditoAluno.saldo + valor;
    const { error } = await supabase.from("alunos").update({ saldo: novoSaldo }).eq("id", creditoAluno.id);
    if (error) { setPagamentoError(error.message); setPagamentoSaving(false); return; }
    await supabase.from("contas").update({ saldo: novoSaldo }).eq("aluno_id", creditoAluno.id);
    await supabase.from("pagamentos").insert({
      cantina_id: CANTINA_ID, aluno_id: creditoAluno.id, valor,
      forma_pagamento: pagamentoForm.forma_pagamento,
      observacao: pagamentoForm.observacao.trim() || null,
      tipo: "credito",
    });
    setPagamentoSaving(false);
    setCreditoAluno(null);
    router.refresh();
  }

  async function handlePagarFiado(e: React.FormEvent) {
    e.preventDefault();
    if (!fiadoAluno) return;
    const valor = parseFloat(pagamentoForm.valor);
    if (isNaN(valor) || valor <= 0) { setPagamentoError("Informe um valor válido."); return; }
    setPagamentoSaving(true);
    setPagamentoError(null);
    const supabase = createClient();
    const { error } = await supabase.from("alunos").update({ saldo: 0, conta_paga: true }).eq("id", fiadoAluno.id);
    if (error) { setPagamentoError(error.message); setPagamentoSaving(false); return; }
    await supabase.from("contas").update({ saldo: 0 }).eq("aluno_id", fiadoAluno.id);
    await supabase.from("pagamentos").insert({
      cantina_id: CANTINA_ID, aluno_id: fiadoAluno.id, valor,
      forma_pagamento: pagamentoForm.forma_pagamento,
      observacao: pagamentoForm.observacao.trim() || null,
      tipo: "fiado",
    });
    setPagamentoSaving(false);
    setFiadoAluno(null);
    router.refresh();
  }

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAddResponsavel() {
    if (!respForm.nome.trim()) { setRespError("Informe o nome do responsável."); return; }
    setSavingResp(true);
    setRespError(null);

    if (editingAluno) {
      const result = await addResponsavel(editingAluno.id, {
        nome:       respForm.nome.trim(),
        email:      respForm.email.trim() || null,
        parentesco: respForm.parentesco || null,
      });
      if ("error" in result) { setSavingResp(false); setRespError(result.error); return; }
      setResponsaveis((prev) => [...prev, result]);
    } else {
      setResponsaveis((prev) => [...prev, {
        id:         `tmp-${Date.now()}`,
        nome:       respForm.nome.trim(),
        email:      respForm.email.trim() || null,
        parentesco: respForm.parentesco || null,
      }]);
    }

    setRespForm({ nome: "", email: "", parentesco: "responsavel" });
    setSavingResp(false);
  }

  async function handleRemoveResponsavel(resp: Responsavel) {
    if (editingAluno && !resp.id.startsWith("tmp-")) {
      await removeResponsavel(editingAluno.id, resp.id);
    }
    setResponsaveis((prev) => prev.filter((r) => r.id !== resp.id));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const supabase = createClient();

    if (editingAluno) {
      const { error: alunoError } = await supabase
        .from("alunos")
        .update({
          nome:                 form.nome.trim(),
          turma:                form.turma.trim() || null,
          ciclo_cobranca:       form.ciclo_cobranca,
          dia_cobranca:         form.ciclo_cobranca === "mensal" ? parseInt(form.dia_cobranca) || 5 : null,
          limite_diario:        parseInt(form.limite_diario) || 0,
          tipo_conta:           form.tipo_conta,
          saldo:                parseFloat(form.saldo_inicial) || 0,
          telefone_responsavel: form.telefone_responsavel.trim() || null,
          email_responsavel:    form.email_responsavel.trim()    || null,
        })
        .eq("id", editingAluno.id);

      if (alunoError) { setSaving(false); setFormError(alunoError.message); return; }

      // sync contas (best-effort)
      await supabase.from("contas").update({ saldo: parseFloat(form.saldo_inicial) || 0 }).eq("aluno_id", editingAluno.id);

      setSaving(false);
    } else {
      const { data: aluno, error: alunoError } = await supabase
        .from("alunos")
        .insert({
          cantina_id: CANTINA_ID,
          nome:                 form.nome.trim(),
          turma:                form.turma.trim() || null,
          ciclo_cobranca:       form.ciclo_cobranca,
          dia_cobranca:         form.ciclo_cobranca === "mensal" ? parseInt(form.dia_cobranca) || 5 : null,
          limite_diario:        parseInt(form.limite_diario) || 0,
          tipo_conta:           form.tipo_conta,
          saldo:                parseFloat(form.saldo_inicial) || 0,
          telefone_responsavel: form.telefone_responsavel.trim() || null,
          email_responsavel:    form.email_responsavel.trim()    || null,
        })
        .select("id")
        .single();

      if (alunoError) { setSaving(false); setFormError(alunoError.message); return; }

      // sync contas (best-effort)
      await supabase.from("contas").insert({ cantina_id: CANTINA_ID, aluno_id: aluno.id, saldo: parseFloat(form.saldo_inicial) || 0 });

      // save pending guardians via server action (bypasses RLS correctly)
      for (const resp of responsaveis) {
        await addResponsavel(aluno.id, {
          nome:       resp.nome,
          email:      resp.email,
          parentesco: resp.parentesco,
        });
      }

      setSaving(false);
    }

    closeModal();
    router.refresh();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="search"
          placeholder="Buscar por nome ou turma..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
        />
        <button
          onClick={openModal}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-sm rounded-lg transition-all shadow-md shadow-orange-500/20"
        >
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">Novo Aluno</span>
        </button>
      </div>

      {/* ── Cards mobile (abaixo de md) ─────────────────────── */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <p className="py-14 text-center text-sm text-gray-500">
            {search
              ? "Nenhum aluno encontrado para essa busca."
              : "Nenhum aluno cadastrado. Toque em \"+\" para começar."}
          </p>
        ) : (
          filtered.map((aluno) => {
            const saldo  = getSaldo(aluno);
            const status = statusBadge(saldo);
            return (
              <div key={aluno.id} className="bg-cp-surface border border-cp-border rounded-2xl p-4 space-y-3">
                {/* Nome + saldo */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{aluno.nome}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{aluno.turma ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-bold tabular-nums ${saldo < 0 ? "text-red-400" : saldo < 10 ? "text-amber-400" : "text-emerald-400"}`}>
                      {fmt(saldo)}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    aluno.tipo_conta === "fiado"
                      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                      : "bg-blue-400/10 text-blue-400 border-blue-400/20"
                  }`}>
                    {aluno.tipo_conta === "fiado" ? "Fiado" : "Crédito"}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    aluno.ciclo_cobranca === "semanal"
                      ? "bg-violet-400/10 text-violet-300 border-violet-400/20"
                      : "bg-sky-400/10 text-sky-300 border-sky-400/20"
                  }`}>
                    {aluno.ciclo_cobranca === "semanal" ? "📅 Semanal" : "🗓️ Mensal"}
                  </span>
                  {aluno.tipo_conta === "fiado" && (
                    aluno.conta_paga === true
                      ? <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-400/10 text-emerald-400 border-emerald-400/20">Paga</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full border bg-red-400/10 text-red-400 border-red-400/20">Pendente</span>
                  )}
                </div>

                {/* Botões de ação */}
                <div className="flex gap-2 pt-1 border-t border-cp-border">
                  <button
                    onClick={() => openEditModal(aluno)}
                    className="flex-1 py-2 rounded-lg bg-cp-elevated border border-cp-border text-gray-400 hover:text-orange-400 hover:border-orange-500/30 text-xs font-medium transition active:scale-95"
                  >
                    Editar
                  </button>
                  {aluno.tipo_conta !== "fiado" ? (
                    <button
                      onClick={() => openCreditoModal(aluno)}
                      className="flex-1 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium transition hover:bg-emerald-500/20 active:scale-95"
                    >
                      + Crédito
                    </button>
                  ) : aluno.conta_paga !== true ? (
                    <button
                      onClick={() => openFiadoModal(aluno)}
                      className="flex-1 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium transition hover:bg-orange-500/20 active:scale-95"
                    >
                      Registrar Pgto
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setDeleteError(null); setDeletingAluno(aluno); }}
                    className="w-10 py-2 rounded-lg bg-cp-elevated border border-cp-border text-gray-500 hover:text-red-400 hover:border-red-500/30 transition active:scale-95 flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Tabela desktop (md+) ─────────────────────────── */}
      <div className="hidden md:block rounded-xl border border-cp-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-cp-elevated">
                {["Nome", "Turma", "Tipo", "Pagamento", "Saldo", "Conta", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                      i === 4 ? "text-right" : i >= 5 ? "text-center" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cp-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-sm text-gray-500">
                    {search
                      ? "Nenhum aluno encontrado para essa busca."
                      : "Nenhum aluno cadastrado. Clique em \"+ Novo Aluno\" para começar."}
                  </td>
                </tr>
              ) : (
                filtered.map((aluno) => {
                  const saldo  = getSaldo(aluno);
                  const status = statusBadge(saldo);
                  return (
                    <tr key={aluno.id} className="bg-cp-surface hover:bg-cp-elevated transition-colors group">
                      <td className="px-4 py-3.5 text-sm font-medium text-white whitespace-nowrap">
                        {aluno.nome}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-400 whitespace-nowrap">
                        {aluno.turma ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          aluno.tipo_conta === "fiado"
                            ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                            : "bg-blue-400/10 text-blue-400 border-blue-400/20"
                        }`}>
                          {aluno.tipo_conta === "fiado" ? "Fiado" : "Crédito"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          aluno.ciclo_cobranca === "semanal"
                            ? "bg-violet-400/10 text-violet-300 border-violet-400/20"
                            : "bg-sky-400/10 text-sky-300 border-sky-400/20"
                        }`}>
                          {aluno.ciclo_cobranca === "semanal" ? "📅 Semanal" : "🗓️ Mensal"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={saldo < 0 ? "text-red-400" : saldo < 10 ? "text-amber-400" : "text-emerald-400"}>
                            {fmt(saldo)}
                          </span>
                          {aluno.tipo_conta !== "fiado" && (
                            <button
                              onClick={() => openCreditoModal(aluno)}
                              title="Adicionar crédito"
                              className="w-5 h-5 flex items-center justify-center rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition text-xs font-bold leading-none"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {aluno.tipo_conta === "fiado" ? (
                          aluno.conta_paga === true ? (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-400/10 text-emerald-400 border-emerald-400/20">
                              Paga
                            </span>
                          ) : (
                            <button
                              onClick={() => openFiadoModal(aluno)}
                              title="Registrar pagamento do fiado"
                              className="text-xs px-2 py-0.5 rounded-full border bg-red-400/10 text-red-400 border-red-400/20 hover:bg-emerald-400/10 hover:text-emerald-400 hover:border-emerald-400/20 transition-all cursor-pointer whitespace-nowrap"
                            >
                              Registrar Pgto
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-all">
                          <button
                            onClick={() => openEditModal(aluno)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
                            title="Editar aluno"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => { setDeleteError(null); setDeletingAluno(aluno); }}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Excluir aluno"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          {filtered.length} aluno{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border shrink-0">
              <h3 className="font-semibold text-white">
                {editingAluno ? "Editar Aluno" : "Novo Aluno"}
              </h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Nome <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" required autoFocus
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  className={inputCls}
                  placeholder="Nome completo do aluno"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Turma <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" required
                  value={form.turma}
                  onChange={(e) => set("turma", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: 3º A"
                />
              </div>

              {/* ── Responsáveis ── */}
              <div className="space-y-3 pt-2 border-t border-cp-border">
                <p className="text-sm font-medium text-gray-300">Responsáveis</p>

                {responsaveis.length > 0 && (
                  <div className="space-y-2">
                    {responsaveis.map((resp) => (
                      <div
                        key={resp.id}
                        className="flex items-center gap-2 rounded-lg bg-cp-elevated border border-cp-border px-3 py-2.5"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{resp.nome}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {resp.parentesco && (
                              <span className="text-xs text-gray-500 capitalize">{resp.parentesco}</span>
                            )}
                            {resp.email && (
                              <span className="text-xs text-gray-600 truncate">{resp.email}</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveResponsavel(resp)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-xl bg-cp-elevated/50 border border-cp-border/60 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {responsaveis.length === 0 ? "Adicionar responsável" : "Adicionar outro"}
                  </p>
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={respForm.nome}
                    onChange={(e) => setRespForm((f) => ({ ...f, nome: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    type="email"
                    placeholder="E-mail (acesso ao portal)"
                    value={respForm.email}
                    onChange={(e) => setRespForm((f) => ({ ...f, email: e.target.value }))}
                    className={inputCls}
                  />
                  <select
                    value={respForm.parentesco}
                    onChange={(e) => setRespForm((f) => ({ ...f, parentesco: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="pai">Pai</option>
                    <option value="mae">Mãe</option>
                    <option value="avo">Avô</option>
                    <option value="avo_f">Avó</option>
                    <option value="tio">Tio / Tia</option>
                    <option value="responsavel">Responsável</option>
                  </select>
                  {respError && <p className="text-xs text-red-400">{respError}</p>}
                  <button
                    type="button"
                    onClick={handleAddResponsavel}
                    disabled={savingResp || !respForm.nome.trim()}
                    className="w-full py-2 px-4 bg-cp-elevated border border-cp-border hover:border-orange-500/40 hover:text-orange-400 disabled:opacity-40 text-gray-300 text-sm font-medium rounded-lg transition"
                  >
                    {savingResp ? "Adicionando..." : "+ Adicionar responsável"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Telefone do responsável (WhatsApp)
                </label>
                <input
                  type="tel"
                  value={form.telefone_responsavel}
                  onChange={(e) => set("telefone_responsavel", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: (11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tipo de conta
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["credito", "fiado"] as const).map((tipo) => (
                    <label
                      key={tipo}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        form.tipo_conta === tipo
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      <input
                        type="radio" name="tipo_conta" value={tipo}
                        checked={form.tipo_conta === tipo}
                        onChange={() => set("tipo_conta", tipo)}
                        className="sr-only"
                      />
                      {tipo === "credito" ? "💳 Crédito" : "📋 Fiado"}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  {editingAluno ? "Saldo (R$)" : "Saldo inicial (R$)"}
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.saldo_inicial}
                  onChange={(e) => set("saldo_inicial", e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Limite diário */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300">
                    Limite diário de consumo
                  </label>
                  <span className={`text-sm font-semibold tabular-nums ${
                    parseInt(form.limite_diario) === 0 ? "text-gray-500" : "text-orange-400"
                  }`}>
                    {parseInt(form.limite_diario) === 0
                      ? "Sem limite"
                      : <>{fmt(parseInt(form.limite_diario))}<span className="text-xs font-normal text-gray-500"> / dia</span></>
                    }
                  </span>
                </div>
                <input
                  type="range"
                  min="0" max="50" step="1"
                  value={form.limite_diario}
                  onChange={(e) => set("limite_diario", e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500
                    [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:shadow-orange-500/40
                    [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0
                    [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-orange-500
                    [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f97316 ${(parseInt(form.limite_diario) / 50) * 100}%, #374151 ${(parseInt(form.limite_diario) / 50) * 100}%)`,
                  }}
                />
                <div className="flex justify-between mt-1.5 text-[11px] text-gray-600 select-none">
                  <span>Sem limite</span>
                  <span>R$ 50</span>
                </div>
              </div>

              {/* Ciclo de cobrança */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ciclo de cobrança
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["semanal", "mensal"] as const).map((ciclo) => (
                    <label
                      key={ciclo}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        form.ciclo_cobranca === ciclo
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      <input
                        type="radio" name="ciclo_cobranca" value={ciclo}
                        checked={form.ciclo_cobranca === ciclo}
                        onChange={() => set("ciclo_cobranca", ciclo)}
                        className="sr-only"
                      />
                      {ciclo === "semanal" ? "📅 Semanal" : "🗓️ Mensal"}
                    </label>
                  ))}
                </div>
                {form.ciclo_cobranca === "semanal" && (
                  <p className="mt-2 text-xs text-gray-500">Cobrança toda sexta-feira</p>
                )}
              </div>

              {/* Dia do mês — visível apenas quando Mensal */}
              {form.ciclo_cobranca === "mensal" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Dia do mês para cobrança <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" required min="1" max="31" step="1"
                    value={form.dia_cobranca}
                    onChange={(e) => set("dia_cobranca", e.target.value)}
                    className={inputCls}
                    placeholder="Ex: 5"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    Cobrança todo dia {form.dia_cobranca || "—"} de cada mês
                  </p>
                </div>
              )}

              {formError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={closeModal}
                  className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  ) : editingAluno ? "Salvar alterações" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Adicionar Crédito */}
      {creditoAluno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setCreditoAluno(null)}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border">
              <div>
                <h3 className="font-semibold text-white">Adicionar Crédito</h3>
                <p className="text-xs text-gray-500 mt-0.5">{creditoAluno.nome}</p>
              </div>
              <button
                onClick={() => setCreditoAluno(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdicionarCredito} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Valor (R$) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" required autoFocus min="0.01" step="0.01"
                  value={pagamentoForm.valor}
                  onChange={(e) => setPag("valor", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Saldo atual: <span className="text-emerald-400 font-medium">{fmt(creditoAluno.saldo)}</span>
                  {pagamentoForm.valor && !isNaN(parseFloat(pagamentoForm.valor)) && (
                    <> → <span className="text-emerald-400 font-medium">{fmt(creditoAluno.saldo + parseFloat(pagamentoForm.valor))}</span></>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Forma de pagamento <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <label
                      key={f.value}
                      className={`flex items-center justify-center py-2 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        pagamentoForm.forma_pagamento === f.value
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      <input
                        type="radio" name="forma_credito" value={f.value}
                        checked={pagamentoForm.forma_pagamento === f.value}
                        onChange={() => setPag("forma_pagamento", f.value)}
                        className="sr-only"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              {pagamentoError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {pagamentoError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={() => setCreditoAluno(null)}
                  className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={pagamentoSaving}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {pagamentoSaving ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  ) : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pagamento Fiado */}
      {fiadoAluno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setFiadoAluno(null)}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border">
              <div>
                <h3 className="font-semibold text-white">Registrar Pagamento</h3>
                <p className="text-xs text-gray-500 mt-0.5">{fiadoAluno.nome}</p>
              </div>
              <button
                onClick={() => setFiadoAluno(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePagarFiado} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Valor recebido (R$) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" required autoFocus min="0.01" step="0.01"
                  value={pagamentoForm.valor}
                  onChange={(e) => setPag("valor", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                />
                {fiadoAluno.saldo < 0 && (
                  <p className="mt-1 text-xs text-gray-600">
                    Dívida atual: <span className="text-red-400 font-medium">{fmt(Math.abs(fiadoAluno.saldo))}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Forma de pagamento <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <label
                      key={f.value}
                      className={`flex items-center justify-center py-2 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        pagamentoForm.forma_pagamento === f.value
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      <input
                        type="radio" name="forma_fiado" value={f.value}
                        checked={pagamentoForm.forma_pagamento === f.value}
                        onChange={() => setPag("forma_pagamento", f.value)}
                        className="sr-only"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Data</label>
                <input
                  type="date"
                  value={pagamentoForm.data}
                  onChange={(e) => setPag("data", e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Observação <span className="text-gray-600 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={pagamentoForm.observacao}
                  onChange={(e) => setPag("observacao", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: Pago pelo responsável na cantina"
                />
              </div>

              {pagamentoError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {pagamentoError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={() => setFiadoAluno(null)}
                  className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={pagamentoSaving}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {pagamentoSaving ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  ) : "Confirmar Pagamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {deletingAluno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDeletingAluno(null)}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="w-11 h-11 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-1.5">Excluir aluno</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Tem certeza que deseja excluir{" "}
                <span className="text-white font-medium">{deletingAluno.nome}</span>?
                {" "}Essa ação não pode ser desfeita.
              </p>

              {deleteError && (
                <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setDeletingAluno(null)}
                className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-500/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Excluindo...</>
                ) : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
