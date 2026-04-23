import { useState } from "react"
import { Button } from "@akari-os/shell-ui/button"
import { MODELS, DEFAULT_MODEL_ID, getModelById } from "@akari-os/sdk/models"

export default function HelloFullApp() {
  const [count, setCount] = useState(0)
  const defaultModel = getModelById(DEFAULT_MODEL_ID)
  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">👋 Hello from runtime!</h1>
      <p className="text-muted-foreground mb-6">
        この App は <code>~/.akari/apps/com.example.hello-full/dist/index.js</code>{" "}
        から runtime dynamic import で読み込まれています。build-in ではありません。
      </p>

      <div className="space-y-4">
        <section className="p-4 border border-border rounded-lg">
          <h2 className="font-semibold mb-2">SDK runtime 動作確認</h2>
          <p className="text-sm">
            Default model:{" "}
            <strong>{defaultModel?.name ?? "(未解決)"}</strong>{" "}
            <span className="text-muted-foreground text-xs">
              ({MODELS.length} models 読み込み済み)
            </span>
          </p>
        </section>

        <section className="p-4 border border-border rounded-lg">
          <h2 className="font-semibold mb-2">shell-ui の Button 動作確認</h2>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCount((c) => c + 1)}>Click me</Button>
            <span>Count: {count}</span>
          </div>
        </section>

        <section className="p-4 border border-border rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
          <h2 className="font-semibold mb-2">✅ Runtime install 成功の証拠</h2>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>この画面が表示されている = import map + shim + window globals が機能</li>
            <li>Button が shell-ui から取得できた</li>
            <li>MODELS が @akari-os/sdk/models から取得できた</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
