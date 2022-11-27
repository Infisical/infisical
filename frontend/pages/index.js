import React, { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="bg-bunker-800 w-screen"></div>;
}
