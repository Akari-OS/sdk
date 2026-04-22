/**
 * QuestionsWizard — ステッパー形式の質問ダイアログ。
 *
 * Partner が [questions]...[/questions] で返した質問セットを
 * チャット内にインラインで表示し、ユーザーの回答を収集する。
 *
 * Claude Code の AskUserQuestion 風 UI:
 * - 左右ナビゲーション（前へ / 次へ）
 * - 数字キーで選択肢を選べる
 * - スキップ可能
 * - 最後に「実行」ボタン
 */

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Zap } from "lucide-react";

export interface Question {
  id: string;
  text: string;
  options: string[];
  default?: number;
  /** true なら複数選択可能 */
  multi?: boolean;
}

interface QuestionsWizardProps {
  questions: Question[];
  onComplete: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

export function QuestionsWizard({ questions, onComplete, onCancel }: QuestionsWizardProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInput, setCustomInput] = useState("");

  const current = questions[step];
  const isLast = step === questions.length - 1;
  const isFirst = step === 0;
  const selectedOption = current ? answers[current.id] : undefined;
  // 複数選択時の選択状態（カンマ区切り文字列を Set に変換）
  const selectedSet = new Set(selectedOption?.split(", ") ?? []);

  const selectOption = useCallback((option: string) => {
    if (!current) return;
    if (current.multi) {
      // 複数選択: トグル
      setAnswers((prev) => {
        const existing = new Set(prev[current.id]?.split(", ").filter(Boolean) ?? []);
        if (existing.has(option)) {
          existing.delete(option);
        } else {
          existing.add(option);
        }
        return { ...prev, [current.id]: [...existing].join(", ") };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [current.id]: option }));
    }
    setCustomInput("");
  }, [current]);

  const handleNext = useCallback(() => {
    if (!current) return;
    // カスタム入力がある場合はそちらを優先
    if (customInput.trim()) {
      setAnswers((prev) => ({ ...prev, [current.id]: customInput.trim() }));
    }
    if (isLast) {
      // 最終回答を含めて complete
      const finalAnswers = { ...answers };
      if (customInput.trim()) {
        finalAnswers[current.id] = customInput.trim();
      }
      onComplete(finalAnswers);
    } else {
      setStep((s) => s + 1);
      setCustomInput("");
    }
  }, [current, isLast, answers, customInput, onComplete]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    // default 値があればそれを使用
    if (current.default !== undefined && current.options[current.default]) {
      setAnswers((prev) => ({ ...prev, [current.id]: current.options[current.default!]! }));
    }
    if (isLast) {
      onComplete(answers);
    } else {
      setStep((s) => s + 1);
      setCustomInput("");
    }
  }, [current, isLast, answers, onComplete]);

  const handlePrev = useCallback(() => {
    if (!isFirst) {
      setStep((s) => s - 1);
      setCustomInput("");
    }
  }, [isFirst]);

  // 数字キーで選択
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!current) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= current.options.length) {
        selectOption(current.options[num - 1]!);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, selectOption]);

  if (!current) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-[10px] text-muted-foreground font-medium">
          質問 {step + 1}/{questions.length}
        </span>
        {/* ステップインジケーター */}
        <div className="flex items-center gap-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition ${
                i === step
                  ? "bg-primary"
                  : i < step
                    ? "bg-primary/40"
                    : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground transition p-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Question */}
      <div className="px-3 py-2">
        <p className="text-[11px] font-medium mb-1.5">{current.text}</p>

        {/* Options — コンパクトに1行で並べる */}
        <div className="flex flex-wrap gap-1 mb-1.5">
          {current.multi && (
            <span className="text-[9px] text-muted-foreground w-full mb-0.5">複数選択可</span>
          )}
          {current.options.map((option, i) => {
            const isSelected = current.multi ? selectedSet.has(option) : selectedOption === option;
            return (
              <button
                key={i}
                onClick={() => selectOption(option)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition flex items-center gap-0.5 ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:border-primary/40 text-foreground"
                }`}
              >
                <span className="text-[8px] text-muted-foreground font-mono">{i + 1}</span>
                {option}
              </button>
            );
          })}
        </div>

        {/* Custom input — 高さを抑える */}
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleNext();
            }
          }}
          placeholder="自由入力..."
          className="w-full text-[10px] px-2 py-1 rounded border border-border bg-background focus:border-primary/50 focus:outline-none transition placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className="text-[10px] text-muted-foreground hover:text-foreground transition disabled:opacity-30 flex items-center gap-0.5"
        >
          <ChevronLeft className="w-3 h-3" />
          前へ
        </button>

        <button
          onClick={handleSkip}
          className="text-[10px] text-muted-foreground hover:text-foreground transition"
        >
          スキップ
        </button>

        <button
          onClick={handleNext}
          className={`text-[10px] flex items-center gap-0.5 transition font-medium ${
            isLast
              ? "text-primary hover:text-primary/80"
              : "text-foreground hover:text-primary"
          }`}
        >
          {isLast ? (
            <>
              <Zap className="w-3 h-3" />
              実行
            </>
          ) : (
            <>
              次へ
              <ChevronRight className="w-3 h-3" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
