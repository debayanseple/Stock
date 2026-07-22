
REVOKE EXECUTE ON FUNCTION public.get_invite_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_org_member_limit() FROM PUBLIC, anon, authenticated;
