import AuthForm from "../components/auth/AuthForm";
import AuthLayout from "../components/auth/AuthLayout";

function Login() {
  return (
    <AuthLayout mode="login">
      <AuthForm mode="login" />
    </AuthLayout>
  );
}

export default Login;
