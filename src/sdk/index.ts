export async function initEtherMail() {
  const url = new URL(window.location.href);

  if (url.pathname === "/ethermailCallback") {
    const token = url.searchParams.get("token");

    if (token) {
      localStorage.setItem("ethermail_token", token);
    }
  }
}
