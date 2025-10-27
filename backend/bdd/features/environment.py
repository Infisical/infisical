from behave.runner import Context


def before_all(context: Context):
    context.vars = {}
