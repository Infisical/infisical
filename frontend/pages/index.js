import React, { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
	const router = useRouter();

	useEffect(async () => {
		router.push("/login");
	}, []);

	return (
		<div className="bg-bunker-800 w-screen">
		</div>
	);
}
