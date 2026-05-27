"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Produto = {
  id: string;
  emoji: string;
  nome: string;
  preco: number;
  estoque: number;
  estoque_minimo: number;
  disponivel: boolean;
  categoria: string | null;
  foto_url: string | null;
};

// ── constantes ────────────────────────────────────────────────────────────────

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

const CATEGORIAS = [
  { value: "salgados",    label: "Salgados"    },
  { value: "bebidas",     label: "Bebidas"     },
  { value: "doces",       label: "Doces"       },
  { value: "salgadinhos", label: "Salgadinhos" },
  { value: "outros",      label: "Outros"      },
] as const;

type CategoriaValue = typeof CATEGORIAS[number]["value"];

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label])
);

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function stockInfo(estoque: number, minimo: number) {
  if (estoque === 0)     return { label: "Esgotado",             cls: "bg-red-500/10    text-red-400    border-red-500/20"    };
  if (estoque <= minimo) return { label: `Crítico (${estoque})`, cls: "bg-amber-400/10  text-amber-400  border-amber-400/20" };
  return                        { label: `${estoque} un.`,       cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" };
}

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

// ── componente ────────────────────────────────────────────────────────────────

export default function ProdutosList({ initialProdutos }: { initialProdutos: Produto[] }) {
  const router = useRouter();

  // estado local dos produtos para atualização imediata sem router.refresh()
  const [produtos,      setProdutos]      = useState<Produto[]>(initialProdutos);

  const [search,           setSearch]           = useState("");
  const [categoriaFiltro,  setCategoriaFiltro]  = useState<"todos" | CategoriaValue>("todos");
  const [showModal,        setShowModal]        = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [formError,        setFormError]        = useState<string | null>(null);
  const [editingProduto,   setEditingProduto]   = useState<Produto | null>(null);
  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [imagePreview,     setImagePreview]     = useState<string | null>(null);
  const [form,             setForm]             = useState({
    emoji: "🍽️", nome: "", preco: "", estoque: "", estoque_minimo: "5",
    categoria: "salgados" as CategoriaValue,
  });

  // estado do modal de reposição de estoque
  const [reposModal,   setReposModal]   = useState<Produto | null>(null);
  const [reposQtd,     setReposQtd]     = useState("");
  const [reposSaving,  setReposSaving]  = useState(false);
  const [reposError,   setReposError]   = useState<string | null>(null);
  const [reposSuccess, setReposSuccess] = useState(false);

  // estado do modal de exclusão
  const [deleteModal, setDeleteModal] = useState<Produto | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // sincroniza quando o Server Component revalida
  useEffect(() => {
    setProdutos(initialProdutos);
  }, [initialProdutos]);

  const filtered = useMemo(() => {
    return produtos.filter((p) => {
      const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase());
      const matchCat =
        categoriaFiltro === "todos" ||
        (p.categoria ?? "outros") === categoriaFiltro;
      return matchSearch && matchCat;
    });
  }, [produtos, search, categoriaFiltro]);

  // contagem por categoria para exibir no badge da aba
  const counts = useMemo(() => {
    const map: Record<string, number> = { todos: produtos.length };
    for (const p of produtos) {
      const cat = p.categoria ?? "outros";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [produtos]);

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  useEffect(() => {
    if (!reposModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeReposModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reposModal]);

  useEffect(() => {
    if (!deleteModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setDeleteModal(null);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteModal]);

  function openModal() {
    setEditingProduto(null);
    setForm({ emoji: "🍽️", nome: "", preco: "", estoque: "", estoque_minimo: "5", categoria: "salgados" });
    setFormError(null);
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  }

  function openEditModal(produto: Produto) {
    setEditingProduto(produto);
    setForm({
      emoji:          produto.emoji ?? "🍽️",
      nome:           produto.nome,
      preco:          String(produto.preco),
      estoque:        String(produto.estoque),
      estoque_minimo: String(produto.estoque_minimo),
      categoria:      (produto.categoria as CategoriaValue) ?? "outros",
    });
    setFormError(null);
    setImageFile(null);
    setImagePreview(produto.foto_url ?? null);
    setShowModal(true);
  }

  function closeModal() {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setShowModal(false);
  }

  function openReposModal(produto: Produto) {
    setReposModal(produto);
    setReposQtd("");
    setReposError(null);
    setReposSuccess(false);
  }

  function closeReposModal() {
    if (reposSuccess) return; // impede fechar durante animação de sucesso
    setReposModal(null);
    setReposQtd("");
    setReposError(null);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleReposicao(e: React.FormEvent) {
    e.preventDefault();
    if (!reposModal) return;

    const qtd = parseInt(reposQtd);
    if (!qtd || qtd <= 0) {
      setReposError("Informe uma quantidade válida maior que zero.");
      return;
    }

    setReposSaving(true);
    setReposError(null);

    const supabase = createClient();
    const novoEstoque = reposModal.estoque + qtd;

    const { error: updateError } = await supabase
      .from("produtos")
      .update({ estoque: novoEstoque })
      .eq("id", reposModal.id);

    if (updateError) {
      setReposSaving(false);
      setReposError(updateError.message);
      return;
    }

    await supabase.from("reposicoes").insert({
      produto_id: reposModal.id,
      cantina_id: CANTINA_ID,
      quantidade: qtd,
    });

    // atualiza card imediatamente sem aguardar router.refresh()
    setProdutos((prev) =>
      prev.map((p) => p.id === reposModal.id ? { ...p, estoque: novoEstoque } : p)
    );

    setReposSaving(false);
    setReposSuccess(true);

    setTimeout(() => {
      setReposModal(null);
      setReposQtd("");
      setReposSuccess(false);
    }, 1800);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const supabase = createClient();

    let foto_url: string | null = editingProduto?.foto_url ?? null;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop() ?? "jpg";
      const path = `${CANTINA_ID}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("produtos")
        .upload(path, imageFile, { upsert: true });

      if (uploadError) {
        setSaving(false);
        setFormError(`Erro no upload da foto: ${uploadError.message}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from("produtos").getPublicUrl(path);
      foto_url = publicUrl;
    }

    const payload = {
      emoji:          form.emoji || "🍽️",
      nome:           form.nome.trim(),
      preco:          parseFloat(form.preco),
      estoque:        parseInt(form.estoque) || 0,
      estoque_minimo: parseInt(form.estoque_minimo) || 5,
      categoria:      form.categoria,
      foto_url,
    };

    if (editingProduto) {
      const { error } = await supabase
        .from("produtos")
        .update(payload)
        .eq("id", editingProduto.id);

      setSaving(false);
      if (error) { setFormError(error.message); return; }
    } else {
      const { error } = await supabase
        .from("produtos")
        .insert({ ...payload, cantina_id: CANTINA_ID, disponivel: true });

      setSaving(false);
      if (error) { setFormError(error.message); return; }
    }

    closeModal();
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();

    const { count } = await supabase
      .from("itens_pedido")
      .select("id", { count: "exact", head: true })
      .eq("produto_id", deleteModal.id);

    if (count && count > 0) {
      const { error } = await supabase
        .from("produtos")
        .update({ disponivel: false })
        .eq("id", deleteModal.id);

      if (error) { setDeleteError(error.message); setDeleting(false); return; }
    } else {
      const { error } = await supabase
        .from("produtos")
        .delete()
        .eq("id", deleteModal.id);

      if (error) { setDeleteError(error.message); setDeleting(false); return; }
    }

    setProdutos((prev) => prev.filter((p) => p.id !== deleteModal.id));
    setDeleting(false);
    setDeleteModal(null);
  }

  const TABS = [
    { value: "todos" as const, label: "Todos" },
    ...CATEGORIAS,
  ];

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
        />
        <button
          onClick={openModal}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-sm rounded-lg transition-all shadow-md shadow-orange-500/20"
        >
          + Novo Produto
        </button>
      </div>

      {/* Abas de categoria */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => {
          const active = categoriaFiltro === tab.value;
          const count  = counts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setCategoriaFiltro(tab.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                active
                  ? "bg-orange-500/15 border-orange-500/50 text-orange-400"
                  : "bg-cp-elevated border-cp-border text-gray-400 hover:text-gray-200 hover:border-cp-muted"
              }`}
            >
              {tab.label}
              <span className={`text-xs tabular-nums px-1.5 py-0 rounded-full ${
                active ? "bg-orange-500/20 text-orange-300" : "bg-cp-surface text-gray-600"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid ou empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">{search ? "🔍" : "📦"}</span>
          <p className="text-gray-400 font-medium">
            {search
              ? "Nenhum produto encontrado."
              : categoriaFiltro !== "todos"
              ? `Nenhum produto em "${CATEGORIA_LABEL[categoriaFiltro]}".`
              : "Nenhum produto cadastrado ainda."}
          </p>
          {!search && categoriaFiltro === "todos" && (
            <button
              onClick={openModal}
              className="mt-4 text-sm text-orange-400 hover:text-orange-300 transition"
            >
              Cadastrar primeiro produto →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((p) => {
            const stock    = stockInfo(p.estoque, p.estoque_minimo);
            const catLabel = CATEGORIA_LABEL[p.categoria ?? "outros"] ?? "Outros";
            return (
              <div
                key={p.id}
                className={`relative bg-cp-surface border border-cp-border rounded-xl overflow-hidden flex flex-col hover:border-cp-muted transition group ${
                  (!p.disponivel || p.estoque === 0) ? "opacity-50" : ""
                }`}
              >
                {/* botões editar e excluir */}
                <button
                  onClick={() => openEditModal(p)}
                  className="absolute top-2 right-9 z-10 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
                  title="Editar produto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteModal(p); }}
                  className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Excluir produto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>

                {/* botão repor estoque */}
                <button
                  onClick={(e) => { e.stopPropagation(); openReposModal(p); }}
                  className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all font-bold text-base leading-none"
                  title="Repor estoque"
                >
                  +
                </button>

                {p.foto_url ? (
                  <img
                    src={p.foto_url}
                    alt={p.nome}
                    className="w-full h-[120px] object-cover"
                  />
                ) : (
                  <div className="w-full h-[120px] bg-cp-elevated flex items-center justify-center">
                    <span className="text-4xl leading-none">{p.emoji}</span>
                  </div>
                )}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <p className="text-sm font-medium text-white leading-snug line-clamp-2">{p.nome}</p>
                  <p className="text-base font-bold text-orange-400">{fmt(p.preco)}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${stock.cls}`}>
                      {stock.label}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-400/10 text-gray-500 border-gray-400/20">
                      {catLabel}
                    </span>
                  </div>
                  {/* botão de reposição sempre visível na base do card */}
                  <button
                    onClick={(e) => { e.stopPropagation(); openReposModal(p); }}
                    className="mt-auto pt-2 w-full py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[11px] font-medium hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-emerald-400 transition flex items-center justify-center gap-1"
                  >
                    <span className="text-sm font-bold leading-none">+</span> Repor estoque
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="mt-4 text-xs text-gray-600">
          {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Modal de cadastro / edição */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border sticky top-0 bg-cp-surface z-10">
              <h3 className="font-semibold text-white">
                {editingProduto ? "Editar Produto" : "Novo Produto"}
              </h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {/* Emoji + Nome */}
              <div className="flex gap-3 items-end">
                <div className="shrink-0">
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Emoji</label>
                  <input
                    type="text" maxLength={2}
                    value={form.emoji}
                    onChange={(e) => set("emoji", e.target.value)}
                    className="w-14 h-10 text-center text-2xl rounded-lg bg-cp-elevated border border-cp-border text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Nome <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" required autoFocus
                    value={form.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    className={inputCls}
                    placeholder="Nome do produto"
                  />
                </div>
              </div>

              {/* Foto */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Foto <span className="text-gray-600 font-normal">(opcional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-cp-elevated border border-cp-border flex items-center justify-center overflow-hidden shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{form.emoji || "🍽️"}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block cursor-pointer">
                      <div className={inputCls + " cursor-pointer text-center hover:border-orange-500/50 hover:text-gray-200"}>
                        {imagePreview ? "Alterar foto" : "Escolher foto..."}
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleImageChange}
                        className="sr-only"
                      />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={() => {
                          if (imageFile) URL.revokeObjectURL(imagePreview);
                          setImageFile(null);
                          setImagePreview(editingProduto?.foto_url ?? null);
                        }}
                        className="mt-1.5 text-xs text-gray-600 hover:text-red-400 transition"
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Categoria <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map((cat) => (
                    <label
                      key={cat.value}
                      className={`flex items-center justify-center py-2 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        form.categoria === cat.value
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      <input
                        type="radio" name="categoria" value={cat.value}
                        checked={form.categoria === cat.value}
                        onChange={() => set("categoria", cat.value)}
                        className="sr-only"
                      />
                      {cat.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Preço */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Preço (R$) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" required min="0" step="0.01"
                  value={form.preco}
                  onChange={(e) => set("preco", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                />
              </div>

              {/* Estoque */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Estoque <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" required min="0" step="1"
                    value={form.estoque}
                    onChange={(e) => set("estoque", e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Estoque mínimo
                  </label>
                  <input
                    type="number" min="0" step="1"
                    value={form.estoque_minimo}
                    onChange={(e) => set("estoque_minimo", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

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
                  ) : editingProduto ? "Salvar alterações" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteModal(null)}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Remover produto</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Tem certeza que deseja remover <span className="text-white font-medium">{deleteModal.nome}</span>?
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    Se houver histórico de vendas, o produto será desativado. Caso contrário, será excluído permanentemente.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Removendo...</>
                  ) : "Remover"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reposição de estoque */}
      {reposModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeReposModal}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <span className="text-emerald-400">↑</span> Repor Estoque
              </h3>
              {!reposSuccess && (
                <button
                  onClick={closeReposModal}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {reposSuccess ? (
              <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-white font-semibold">Estoque reposto com sucesso!</p>
                <p className="text-sm text-gray-500">
                  {reposModal.nome} — novo estoque: {reposModal.estoque + parseInt(reposQtd || "0")} un.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReposicao} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Produto</label>
                  <p className="text-white font-medium text-sm">{reposModal.nome}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estoque atual</label>
                  <p className={`text-sm font-semibold ${
                    reposModal.estoque === 0
                      ? "text-red-400"
                      : reposModal.estoque <= reposModal.estoque_minimo
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}>
                    {reposModal.estoque} unidade{reposModal.estoque !== 1 ? "s" : ""}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Quantidade a adicionar <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    autoFocus
                    value={reposQtd}
                    onChange={(e) => { setReposQtd(e.target.value); setReposError(null); }}
                    className={inputCls}
                    placeholder="Ex: 20"
                  />
                  {reposQtd && parseInt(reposQtd) > 0 && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      Novo estoque: <span className="text-emerald-400 font-semibold">{reposModal.estoque + parseInt(reposQtd)} un.</span>
                    </p>
                  )}
                </div>

                {reposError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                    {reposError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeReposModal}
                    className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-medium transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={reposSaving}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                  >
                    {reposSaving ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                    ) : "Repor Estoque"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
