import PortalLoginForm from "@/components/portal/PortalLoginForm";

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4 shadow-lg shadow-blue-500/20">
            <span className="text-3xl">👨‍👩‍👧</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Portal do Responsável</h1>
          <p className="text-gray-400 mt-1 text-sm">Acompanhe o consumo do seu filho na cantina</p>
        </div>

        <div className="bg-cp-surface border border-cp-border rounded-2xl p-8 shadow-xl">
          <PortalLoginForm />
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          © {new Date().getFullYear()} CantinaPro. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
