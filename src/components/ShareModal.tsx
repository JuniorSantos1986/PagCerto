import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { api } from "../lib/api";
import { Modal } from "./Modal";

interface ShareModalProps {
  token: string | null;
  onClose: () => void;
  onTokenChange: (token: string | null) => void;
  onNotify: (message: string, tone: "success" | "error") => void;
}

export function ShareModal({
  token,
  onClose,
  onTokenChange,
  onNotify,
}: ShareModalProps) {
  const [createdToken, setCreatedToken] = useState(token);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = createdToken
    ? `${window.location.origin}/share/${createdToken}`
    : "";

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const result = await api.createShareToken();
      setCreatedToken(result.token);
      onTokenChange(result.token);
      onNotify("Link de compartilhamento criado.", "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    setError(null);
    try {
      await api.revokeShareToken();
      setCreatedToken(null);
      onTokenChange(null);
      setConfirmRevoke(false);
      onNotify("Link desativado.", "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desativar o link.");
    } finally {
      setRevoking(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      onNotify("Link copiado.", "success");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <Modal
      title="Compartilhar despesas"
      subtitle="Envie um link para alguém acompanhar seu mês."
      onClose={onClose}
    >
      <div className="share-body">
        {!createdToken ? (
          <>
            <div className="share-hero">
              <span className="share-hero-icon" aria-hidden="true">
                <Link2 size={24} />
              </span>
              <h3>Um link, somente leitura</h3>
              <p>
                Quem receber o link pode navegar pelos meses, ver o resumo, as
                despesas e o calendário. Ninguém consegue editar, excluir ou marcar
                pagamentos.
              </p>
            </div>
            <button
              type="button"
              className="button button-primary button-block"
              onClick={handleCreate}
              disabled={creating}
            >
              <Link2 size={16} />
              {creating ? "Criando link…" : "Criar link de compartilhamento"}
            </button>
          </>
        ) : (
          <>
            <label className="field share-link-field">
              <span>Link de compartilhamento</span>
              <span className="share-link-row">
                <input type="text" value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className={`button ${copied ? "button-success" : "button-primary"}`}
                  onClick={copyLink}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </span>
            </label>

            <div className="share-actions">
              <a
                className="button button-ghost"
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                Abrir link
              </a>
              <button
                type="button"
                className="text-button danger"
                onClick={() => setConfirmRevoke(true)}
              >
                <Unlink size={14} />
                Desativar link
              </button>
            </div>

            {confirmRevoke && (
              <div className="inline-confirm" role="alertdialog" aria-label="Confirmar desativação">
                <p>
                  Desativar o link? Quem já tiver acesso perderá a visualização
                  imediatamente.
                </p>
                <div>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setConfirmRevoke(false)}
                    disabled={revoking}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={handleRevoke}
                    disabled={revoking}
                  >
                    {revoking ? "Desativando…" : "Sim, desativar"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <p className="share-privacy">
          <ShieldCheck size={15} />
          O link dá acesso somente leitura. Você pode desativá-lo quando quiser.
        </p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
