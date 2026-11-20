import { RegisterForm } from '@/components/zones/register-form';

export const metadata = { title: 'Регистрация зоны — JustTLD' };

export default function RegisterPage() {
  return (
    <div className="container py-10">
      <RegisterForm />
    </div>
  );
}
