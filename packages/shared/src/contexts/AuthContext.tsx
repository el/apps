import React, {
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AnonymousUser,
  LoggedUser,
  logout as dispatchLogout,
  deleteAccount,
} from '../lib/user';
import { Visit } from '../lib/boot';
import {
  AuthSession,
  checkCurrentSession,
  getLogoutSession,
  logoutSession,
  validatePasswordLogin,
  validateRegistration,
} from '../lib/auth';

export type LoginState = { trigger: string };

export interface AuthContextData {
  user?: LoggedUser;
  session?: AuthSession;
  trackingId?: string;
  shouldShowLogin: boolean;
  showLogin: (trigger: string) => void;
  closeLogin: () => void;
  loginState?: LoginState;
  logout: () => Promise<void>;
  updateUser: (user: LoggedUser) => Promise<void>;
  loadingUser?: boolean;
  tokenRefreshed: boolean;
  loadedUserFromCache?: boolean;
  getRedirectUri: () => string;
  anonymous?: AnonymousUser;
  visit?: Visit;
  isFirstVisit?: boolean;
  deleteAccount?: () => Promise<void>;
  onPasswordRegistration: typeof validateRegistration;
  onPasswordLogin: typeof validatePasswordLogin;
}

const AuthContext = React.createContext<AuthContextData>(null);
export default AuthContext;

export const getQueryParams = (): Record<string, string> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

  return params;
};

export const REGISTRATION_PATH = '/register';

const appendLogoutParam = (link: string): URL => {
  const url = new URL(link);
  url.searchParams.append('logged_out', 'true');

  return url;
};

const logout = async (logoutUrl: string, token: string): Promise<void> => {
  await Promise.all([dispatchLogout(), logoutSession(logoutUrl, token)]); // temporary
  const params = getQueryParams();
  if (params.redirect_uri) {
    window.location.replace(appendLogoutParam(params.redirect_uri));
  } else if (window.location.pathname === REGISTRATION_PATH) {
    window.location.replace(
      appendLogoutParam(process.env.NEXT_PUBLIC_WEBAPP_URL),
    );
  } else {
    window.location.replace(appendLogoutParam(window.location.href));
  }
};

export type AuthContextProviderProps = {
  user: LoggedUser | AnonymousUser | undefined;
  children?: ReactNode;
} & Pick<
  AuthContextData,
  | 'getRedirectUri'
  | 'updateUser'
  | 'loadingUser'
  | 'tokenRefreshed'
  | 'loadedUserFromCache'
  | 'visit'
>;

export const AuthContextProvider = ({
  children,
  user,
  updateUser,
  loadingUser,
  tokenRefreshed,
  loadedUserFromCache,
  getRedirectUri,
  visit,
}: AuthContextProviderProps): ReactElement => {
  const [session, setSession] = useState<AuthSession>();
  const [loginState, setLoginState] = useState<LoginState | null>(null);

  const onPasswordLogin: typeof validatePasswordLogin = async (...params) => {
    const loginSession = await validatePasswordLogin(...params);

    if (loginSession) {
      setSession(loginSession);
    }

    return null;
  };

  const onPasswordRegistration: typeof validateRegistration = async (
    ...params
  ) => {
    const response = await validateRegistration(...params);

    if (response.success) {
      setSession(response.success);
    }

    return response;
  };

  const authContext: AuthContextData = useMemo(
    () => ({
      session,
      onPasswordLogin,
      onPasswordRegistration,
      user: user && 'providers' in user ? user : null,
      isFirstVisit: user?.isFirstVisit ?? false,
      trackingId: user?.id,
      shouldShowLogin: loginState !== null,
      showLogin: (trigger) => setLoginState({ trigger }),
      closeLogin: () => setLoginState(null),
      loginState,
      updateUser,
      logout: () => logout(session.logout_url, session.logout_token),
      loadingUser,
      tokenRefreshed,
      loadedUserFromCache,
      getRedirectUri,
      anonymous: user,
      visit,
      deleteAccount,
    }),
    [
      user,
      session,
      loginState,
      loadingUser,
      tokenRefreshed,
      loadedUserFromCache,
      visit,
    ],
  );

  // temporary - this can be coming from which service we will pull the boot information
  // in the case today, it will be from the gateway. once done, we can remove this side effect
  useEffect(() => {
    checkCurrentSession()
      .then(async (userSession) => {
        const logoutData = await getLogoutSession();
        setSession({ ...userSession, ...logoutData });
      })
      .catch(() => setSession(null));
  }, []);

  return (
    <AuthContext.Provider value={authContext}>{children}</AuthContext.Provider>
  );
};
