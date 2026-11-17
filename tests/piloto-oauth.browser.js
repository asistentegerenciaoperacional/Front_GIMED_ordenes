async (page) => {
  await page.route("**/api/v1/auth/inicio", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const url = new URL(response.headers().location);
    if (response.status() !== 302 || url.hostname !== "accounts.google.com" ||
        url.searchParams.get("code_challenge_method") !== "S256" || url.searchParams.get("hd") !== "gimed.com.co" ||
        !url.searchParams.get("state") || !url.searchParams.get("nonce")) throw new Error("Solicitud OAuth incompleta.");
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Solicitud OAuth de piloto verificada" });
  });
  await page.goto("http://localhost:5173");
  await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
  const link = page.getByRole("link", { name: "Continuar con Google Workspace" });
  await link.focus();
  await page.keyboard.press("Enter");
  await page.getByText("Solicitud OAuth de piloto verificada").waitFor();
  console.log("Verificado: acceso con teclado, proxy local y redirección OAuth PKCE.");
}
