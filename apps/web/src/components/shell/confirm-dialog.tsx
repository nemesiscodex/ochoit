import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
} from "@ochoit/ui/components/alert-dialog";
import { memo } from "react";

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
};

export type Confirm = ReturnType<typeof createConfirm<ConfirmRequest>>;

export function createShellConfirm(): Confirm {
  return createConfirm<ConfirmRequest>();
}

export const ConfirmDialog = memo(function ConfirmDialog({ confirm }: { confirm: Confirm }) {
  return (
    <AlertDialog controller={confirm.controller}>
      <AlertDialogContent<ConfirmRequest>>
        {(state) =>
          state.payload === undefined ? null : (
            <>
              <div className="flex flex-col gap-1.5">
                <AlertDialogTitle>{state.payload.title}</AlertDialogTitle>
                <AlertDialogDescription>{state.payload.description}</AlertDialogDescription>
              </div>
              <AlertDialogActions>
                <AlertDialogClose>Cancel</AlertDialogClose>
                <AlertDialogClose variant="primary" value="confirm">
                  {state.payload.confirmLabel}
                </AlertDialogClose>
              </AlertDialogActions>
            </>
          )
        }
      </AlertDialogContent>
    </AlertDialog>
  );
});
