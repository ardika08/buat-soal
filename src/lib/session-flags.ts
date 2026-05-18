const POST_LOGIN_INFO_PENDING_KEY = "post_login_info_pending";
const SUBSCRIPTION_INFO_SEEN_SESSION_KEY = "subscription_info_seen_session";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function markSubscriptionInfoPending() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(POST_LOGIN_INFO_PENDING_KEY, "true");
  window.sessionStorage.removeItem(SUBSCRIPTION_INFO_SEEN_SESSION_KEY);
}

export function shouldShowSubscriptionInfo() {
  if (!canUseSessionStorage()) {
    return false;
  }

  const isPending = window.sessionStorage.getItem(POST_LOGIN_INFO_PENDING_KEY) === "true";
  const isSeen = window.sessionStorage.getItem(SUBSCRIPTION_INFO_SEEN_SESSION_KEY) === "true";

  return isPending && !isSeen;
}

export function markSubscriptionInfoSeen() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(SUBSCRIPTION_INFO_SEEN_SESSION_KEY, "true");
  window.sessionStorage.removeItem(POST_LOGIN_INFO_PENDING_KEY);
}

export function clearSubscriptionInfoSession() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(POST_LOGIN_INFO_PENDING_KEY);
  window.sessionStorage.removeItem(SUBSCRIPTION_INFO_SEEN_SESSION_KEY);
}
