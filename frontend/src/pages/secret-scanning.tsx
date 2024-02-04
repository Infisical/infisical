import { useEffect } from "react";
import { useRouter } from "next/router"

export default function SecretScanning() {
  const router = useRouter();

  useEffect(()=>{
    router.push(`${router.asPath.split("secret-scanning")[0]}/org/${localStorage.getItem("orgData.id")}/secret-scanning${router.asPath.split("secret-scanning")[1]}`)
  }, [])


  return <div/>;
}

SecretScanning.requireAuth = true;