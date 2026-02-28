import { createContext, useState } from "react";

export const AuthContext = createContext();

export function AuthProvider({ children }) {

  const [isGuest, setIsGuest] = useState(false);

  const loginAsGuest = () => {
    console.log("Guest mode");
    setIsGuest(true);
  };

  const logout = () => {
    setIsGuest(false);
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider
      value={{
        isGuest,
        loginAsGuest,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}