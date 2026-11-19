import { buttonVariants } from "@ochoit/ui/components/button";
import { DialogClose } from "@ochoit/ui/components/dialog";
import { X } from "lucide-react";

export function DialogCloseButton() {
  return (
    <DialogClose aria-label="Close" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
      <X aria-hidden="true" />
    </DialogClose>
  );
}
