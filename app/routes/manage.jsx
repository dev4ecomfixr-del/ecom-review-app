import { redirect } from "react-router";

export const loader = async () => {
  return redirect("/admin");
};

export default function Manage() {
  return null;
}
