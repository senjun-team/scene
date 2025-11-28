from django import forms
from django.db import models
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django_prometheus.models import ExportModelOperationsMixin
from allauth.account.forms import ResetPasswordForm

from captcha.fields import CaptchaField

class IdRecord(ExportModelOperationsMixin("IdRecord"), models.Model):
    id_scene = models.CharField(max_length=200, null=True, db_index=True, unique=True)
    id_bot = models.BigIntegerField(null=True, db_index=True, unique=True)
    activation_key = models.CharField(max_length=200, null=True, db_index=True)
    activation_key_dt = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                name="id_record_id_pair_unique",
                fields=["id_scene", "id_bot"],
            ),
        ]

class CaptchaResetPasswordForm(ResetPasswordForm):

    captcha = CaptchaField()

    def save(self, request):

        # Ensure you call the parent class's save.
        # .save() returns a string containing the email address supplied
        email_address = super(CaptchaResetPasswordForm, self).save(request)

        # Add your own processing here.

        # Ensure you return the original result
        return email_address
    
class SignupForm(UserCreationForm):
    email = forms.EmailField(max_length=200, required=True, label="E-mail", help_text="Это обязательное поле")

    password1 = forms.CharField(
        label="Пароль",
        strip=False,
        widget=forms.PasswordInput
    )

    password2 = forms.CharField(
        label="Пароль еще раз",
        strip=False,
        widget=forms.PasswordInput
    )

    captcha = CaptchaField()

    class Meta:
        model = User
        fields = ('username',  'email',  'password1', 'password2')

        labels = {
            'username': "Логин"
        }

        error_messages = {
            'username': {
                'max_length': "Превышена максимальная длина логина в 200 символов",
            },
        }

class LoginForm(forms.Form):
    username = forms.CharField(max_length=200, required=True, label="Логин")
    password = forms.CharField(widget=forms.PasswordInput, required=True, label="Пароль")

    def clean(self):
        username = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')
        user = authenticate(username=username, password=password)
        if not user or not user.is_active:
            raise forms.ValidationError("Указанного сочетания логина и пароля не найдено.")
        return self.cleaned_data

    def login(self, request):
        username = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')
        user = authenticate(username=username, password=password)
        return user