import {
  AccountSettingsCards,
  ChangePasswordCard,
  DeleteAccountCard,
} from "@daveyplate/better-auth-ui";

const Settings = () => {
  return (
    <div
      className="w-full min-h-screen bg-background flex flex-col items-center px-4 py-16
    "
    >
      {/* Wrapper */}
      <div className="w-full max-w-2xl space-y-6">
        <AccountSettingsCards
          classNames={{
            card: {
              base: `
                bg-card/80 backdrop-blur-xl
                border border-border
                rounded-2xl
                shadow-[var(--panel-shadow)]
                transition-all duration-300
                hover:border-[#7C3AED]/40
              `,
              footer: `
                bg-card/60
                border-t border-border
                rounded-b-2xl
              `,
            },
          }}
        />
        <div className="w-full">
          <ChangePasswordCard
            classNames={{
              base: `
              bg-card/80 backdrop-blur-xl
              border border-border
              rounded-2xl
              shadow-[var(--panel-shadow)]
              transition-all duration-300
              hover:border-[#7C3AED]/40
            `,
              footer: `
              bg-card/60
              border-t border-border
              rounded-b-2xl
            `,
            }}
          />
        </div>
        <div className="w-full">
          <DeleteAccountCard
            classNames={{
              base: `
              bg-card/80 backdrop-blur-xl
              border border-border
              rounded-2xl
              shadow-[var(--panel-shadow)]
              transition-all duration-300
              hover:border-red-500/40
            `,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
