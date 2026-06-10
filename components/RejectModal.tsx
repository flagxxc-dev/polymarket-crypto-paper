"use client";

import { useState } from "react";
import { BracketOpportunity } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  bracket: BracketOpportunity;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RejectModal({ bracket, onClose, onSuccess }: Props) {
  const [type, setType] = useState<"soft" | "hard">("hard");
  const [submitting, setSubmitting] = useState(false);

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: bracket.marketId,
          strikePrice: bracket.strikePrice,
          type,
        }),
      });
      onSuccess();
      onClose();
    } catch {
      alert("操作失败");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>跳过机会</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{bracket.question}</p>

          <div className="space-y-2">
            <button
              onClick={() => setType("soft")}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                type === "soft"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/30 hover:bg-secondary/50"
              }`}
            >
              <p className="font-medium">稍后提醒 (24h)</p>
              <p className="text-xs text-muted-foreground">
                24 小时后重新显示
              </p>
            </button>
            <button
              onClick={() => setType("hard")}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                type === "hard"
                  ? "border-destructive bg-destructive/10"
                  : "border-border bg-secondary/30 hover:bg-secondary/50"
              }`}
            >
              <p className="font-medium">永久忽略</p>
              <p className="text-xs text-muted-foreground">
                不再显示此机会
              </p>
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleReject}
              disabled={submitting}
              className={`flex-1 ${type === "hard" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}
            >
              {submitting
                ? "处理中..."
                : type === "hard"
                  ? "永久忽略"
                  : "稍后提醒"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
