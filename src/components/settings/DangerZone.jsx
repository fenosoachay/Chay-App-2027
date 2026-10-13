import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { LogOut, Trash2, Loader2, AlertTriangle } from "lucide-react";

export default function DangerZone() {
  const { deleteAccount, logout: authLogout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logout = () => authLogout();

  const doDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteAccount();
    } catch (e) {
      setError(e.message || "Échec de la suppression");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-destructive mb-3">
        Actions sensibles
      </p>

      {!confirming ? (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Supprimer mon compte
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-destructive text-sm">
                Confirmer la suppression
              </p>
              <p className="text-xs text-foreground/60 mt-1">
                Cette action est importante et potentiellement irréversible.
                Toutes vos données seront définitivement supprimées.
              </p>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={doDelete}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Suppression…
                </>
              ) : (
                "Confirmer"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}