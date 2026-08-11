export async function run(origin: string) {
  // new URL(...).href のような間接呼び出し — リテラルドメイン抽出は不可（generic 検出のみ）
  const resp = await fetch(new URL("/robots.txt", origin).href)
  return resp.text()
}
